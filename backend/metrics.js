const outcomes = ['accepted', 'duplicate', 'rejected'];

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export function createMetrics({ now = Date.now } = {}) {
  const mqttMessages = Object.fromEntries(outcomes.map((outcome) => [outcome, 0]));
  let mqttConnected = 0;
  let postgresReady = 0;
  let httpRequests = 0;
  let httpErrors = 0;
  let lastSuccessfulIngestion = 0;

  return {
    recordIngestion(outcome) {
      if (!Object.hasOwn(mqttMessages, outcome)) {
        throw new Error(`Unsupported ingestion outcome: ${outcome}.`);
      }
      mqttMessages[outcome] += 1;
      if (outcome === 'accepted') lastSuccessfulIngestion = now() / 1000;
    },
    recordHttpRequest() {
      httpRequests += 1;
    },
    recordHttpError() {
      httpErrors += 1;
    },
    setMqttConnected(connected) {
      mqttConnected = connected ? 1 : 0;
    },
    setPostgresReady(ready) {
      postgresReady = ready ? 1 : 0;
    },
    render() {
      return `${[
        '# HELP dt_datacenter_backend_mqtt_messages_total MQTT messages processed by ingestion outcome.',
        '# TYPE dt_datacenter_backend_mqtt_messages_total counter',
        ...outcomes.map(
          (outcome) =>
            `dt_datacenter_backend_mqtt_messages_total{outcome="${outcome}"} ${mqttMessages[outcome]}`
        ),
        '# HELP dt_datacenter_backend_mqtt_connected Whether the backend is connected to MQTT.',
        '# TYPE dt_datacenter_backend_mqtt_connected gauge',
        `dt_datacenter_backend_mqtt_connected ${mqttConnected}`,
        '# HELP dt_datacenter_backend_postgresql_ready Whether PostgreSQL answers readiness checks.',
        '# TYPE dt_datacenter_backend_postgresql_ready gauge',
        `dt_datacenter_backend_postgresql_ready ${postgresReady}`,
        '# HELP dt_datacenter_backend_http_requests_total Backend HTTP requests received.',
        '# TYPE dt_datacenter_backend_http_requests_total counter',
        `dt_datacenter_backend_http_requests_total ${httpRequests}`,
        '# HELP dt_datacenter_backend_http_errors_total Backend HTTP responses with status 4xx or 5xx.',
        '# TYPE dt_datacenter_backend_http_errors_total counter',
        `dt_datacenter_backend_http_errors_total ${httpErrors}`,
        '# HELP dt_datacenter_backend_last_successful_ingestion_timestamp_seconds Unix timestamp of the latest accepted ingestion.',
        '# TYPE dt_datacenter_backend_last_successful_ingestion_timestamp_seconds gauge',
        `dt_datacenter_backend_last_successful_ingestion_timestamp_seconds ${lastSuccessfulIngestion}`,
      ].join('\n')}\n`;
    },
  };
}
