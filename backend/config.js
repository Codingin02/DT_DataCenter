const MQTT_PROTOCOLS = new Set(['mqtt:', 'mqtts:', 'ws:', 'wss:']);
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function integer(environment, name, minimum, maximum) {
  const raw = required(environment, name);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function parsedUrl(value, name, protocols) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (!protocols.has(parsed.protocol)) {
    throw new Error(`${name} uses an unsupported protocol.`);
  }
  return parsed;
}

function optionalSecret(environment, name) {
  const value = environment[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function loadConfiguration(environment = process.env) {
  const mqttUrl = required(environment, 'MQTT_URL');
  const parsedMqttUrl = parsedUrl(mqttUrl, 'MQTT_URL', MQTT_PROTOCOLS);
  if (
    parsedMqttUrl.username ||
    parsedMqttUrl.password ||
    parsedMqttUrl.searchParams.has('username') ||
    parsedMqttUrl.searchParams.has('password')
  ) {
    throw new Error('MQTT_URL must not include credentials; use MQTT_USERNAME and MQTT_PASSWORD.');
  }

  const mqttClientId = required(environment, 'MQTT_CLIENT_ID');
  if (mqttClientId.length > 128) {
    throw new Error('MQTT_CLIENT_ID must be at most 128 characters.');
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  const postgres = databaseUrl
    ? {
        connectionString: parsedUrl(databaseUrl, 'DATABASE_URL', POSTGRES_PROTOCOLS).href,
      }
    : {
        host: required(environment, 'PGHOST'),
        port: integer(environment, 'PGPORT', 1, 65535),
        database: required(environment, 'PGDATABASE'),
        user: required(environment, 'PGUSER'),
        password: optionalSecret(environment, 'PGPASSWORD'),
      };

  return {
    http: {
      host: required(environment, 'HTTP_HOST'),
      port: integer(environment, 'HTTP_PORT', 1, 65535),
    },
    mqtt: {
      url: mqttUrl,
      clientId: mqttClientId,
      username: optionalSecret(environment, 'MQTT_USERNAME'),
      password: optionalSecret(environment, 'MQTT_PASSWORD'),
      sessionExpiryInterval: integer(environment, 'MQTT_SESSION_EXPIRY_SECONDS', 1, 4294967295),
      maxPayloadBytes: integer(environment, 'MQTT_MAX_PAYLOAD_BYTES', 1024, 1048576),
    },
    postgres,
  };
}
