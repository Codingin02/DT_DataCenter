import { createServer } from 'node:http';

import { connect } from 'mqtt';
import pg from 'pg';

import {
  createCurrentStateEvents,
  createDeviceStatusIngestor,
  createHttpHandler,
  createIngestor,
} from './app.js';
import { loadConfiguration } from './config.js';
import { createMetrics } from './metrics.js';

const { Pool } = pg;
const telemetryTopic = 'dt/+/telemetry/+/+/+';
const deviceStatusTopic = 'dt/+/device/+/status';

function safeErrorDetails(error) {
  let message = error instanceof Error ? error.message : String(error);
  const secrets = [
    process.env.DATABASE_URL,
    process.env.PGPASSWORD,
    process.env.PGUSER,
    process.env.MQTT_URL,
    process.env.MQTT_PASSWORD,
    process.env.MQTT_USERNAME,
  ];

  for (const name of ['DATABASE_URL', 'MQTT_URL']) {
    if (process.env[name]) {
      try {
        const url = new URL(process.env[name]);
        secrets.push(decodeURIComponent(url.username), decodeURIComponent(url.password));
      } catch {
        // Configuration validation reports an invalid URL without logging its value.
      }
    }
  }

  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, '[redacted]');
  }

  return {
    ...(typeof error?.code === 'string' ? { code: error.code } : {}),
    message,
  };
}

const logger = {
  error(message, error) {
    console.error(message, safeErrorDetails(error));
  },
};

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function closeHttp(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function closeMqtt(client, force) {
  return client ? client.endAsync(force) : Promise.resolve();
}

async function main() {
  const configuration = loadConfiguration();
  const metrics = createMetrics();
  const currentStateEvents = createCurrentStateEvents();
  const pool = new Pool(configuration.postgres);
  const query = (text, values) => pool.query(text, values);
  let httpServer;
  let mqttClient;
  let mqttReady = false;
  let stopping = false;
  let shutdownPromise;

  const stop = (signal, forceMqtt = false) => {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    mqttReady = false;
    metrics.setMqttConnected(false);
    metrics.setPostgresReady(false);
    currentStateEvents.close();
    if (signal !== 'startup-failure') console.info(`Stopping on ${signal}.`);

    shutdownPromise = (async () => {
      const resourceResults = await Promise.allSettled([
        closeHttp(httpServer),
        closeMqtt(mqttClient, forceMqtt),
      ]);
      const failures = resourceResults
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);

      try {
        await pool.end();
      } catch (error) {
        failures.push(error);
      }

      if (failures.length > 0) {
        throw new AggregateError(failures, 'Graceful shutdown failed.');
      }
    })();

    return shutdownPromise;
  };

  try {
    const migration = await query(
      'SELECT version FROM digital_twin.schema_migrations WHERE version = $1',
      ['foundation']
    );
    if (migration.rowCount !== 1) {
      throw new Error('Required database migration foundation is not applied.');
    }
    metrics.setPostgresReady(true);

    const ingest = createIngestor({
      query,
      maxPayloadBytes: configuration.mqtt.maxPayloadBytes,
      onCurrentState: currentStateEvents.publish,
    });
    const ingestDeviceStatus = createDeviceStatusIngestor({
      query,
      maxPayloadBytes: configuration.mqtt.maxPayloadBytes,
      onCurrentState: currentStateEvents.publish,
    });
    const processTelemetry = async (topic, payload) => {
      const result = await ingest(topic, payload);
      metrics.recordIngestion(result.outcome);
      console.info(
        JSON.stringify({
          event: 'telemetry_ingestion',
          topic,
          outcome: result.outcome,
          reason_code: result.reason_code,
          measurement_id: result.persisted_measurement_id,
          state_version: result.resulting_state_version,
        })
      );
      return result;
    };
    const processDeviceStatus = async (topic, payload) => {
      const result = await ingestDeviceStatus(topic, payload);
      metrics.recordIngestion(result.outcome);
      console.info(
        JSON.stringify({
          event: 'device_status',
          outcome: result.outcome,
          status: result.status,
          reason_code: result.reason_code,
        })
      );
      return result;
    };
    const processMessage = (topic, payload) =>
      topic.split('/')[2] === 'device'
        ? processDeviceStatus(topic, payload)
        : processTelemetry(topic, payload);

    mqttClient = connect(configuration.mqtt.url, {
      clean: false,
      clientId: configuration.mqtt.clientId,
      password: configuration.mqtt.password,
      protocolVersion: 5,
      properties: {
        receiveMaximum: 1,
        sessionExpiryInterval: configuration.mqtt.sessionExpiryInterval,
      },
      username: configuration.mqtt.username,
      customHandleAcks(topic, payload, _packet, done) {
        // QoS 1 is acknowledged only after the PostgreSQL transaction completes.
        processMessage(topic, payload).then(
          () => done(null, 0),
          (error) => {
            done(error);
            setImmediate(() => {
              if (!stopping) mqttClient.reconnect();
            });
          }
        );
      },
    });

    mqttClient.on('connect', () => {
      metrics.setMqttConnected(true);
      mqttReady = false;
      if (stopping) return;
      mqttClient.subscribe([telemetryTopic, deviceStatusTopic], { qos: 1 }, (error) => {
        if (error) {
          logger.error('MQTT subscription failed.', error);
          return;
        }
        mqttReady = !stopping;
        console.info(`MQTT subscribed to ${telemetryTopic} and ${deviceStatusTopic} with QoS 1.`);
      });
    });
    for (const event of ['close', 'disconnect', 'offline', 'reconnect']) {
      mqttClient.on(event, () => {
        metrics.setMqttConnected(false);
        mqttReady = false;
      });
    }
    mqttClient.on('message', (topic, payload, packet) => {
      if (packet.qos === 0) {
        void processMessage(topic, payload).catch((error) => {
          logger.error('QoS 0 MQTT message processing failed.', error);
        });
      }
    });
    mqttClient.on('error', (error) => {
      logger.error('MQTT error.', error);
    });
    pool.on('error', (error) => {
      metrics.setPostgresReady(false);
      logger.error('PostgreSQL pool error.', error);
    });

    httpServer = createServer(
      createHttpHandler({
        query,
        metrics,
        currentStateEvents,
        isMqttReady: () => mqttReady && !stopping,
        isStopping: () => stopping,
        logger,
      })
    );
    await listen(httpServer, configuration.http.port, configuration.http.host);
    console.info(
      `Current-state HTTP listening on http://${configuration.http.host}:${configuration.http.port}.`
    );
  } catch (error) {
    try {
      await stop('startup-failure', true);
    } catch (cleanupError) {
      logger.error('Backend startup cleanup failed.', cleanupError);
    }
    throw error;
  }

  const handleSignal = (signal) => {
    void stop(signal).catch((error) => {
      logger.error('Backend shutdown failed.', error);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
}

main().catch((error) => {
  logger.error('Backend startup failed.', error);
  process.exitCode = 1;
});
