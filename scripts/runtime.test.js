import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Compatibility wrappers and OS runtime behavior are covered by compatibility/deployment tests.
test('optional TLS broker limits ACL topics and enables authenticated TLS persistence', () => {
  const configuration = readFileSync(
    new URL('../docker/mosquitto.server.conf', import.meta.url),
    'utf8'
  );
  const acl = readFileSync(new URL('../docker/mosquitto.server.acl', import.meta.url), 'utf8');
  assert.match(configuration, /^allow_anonymous false$/m);
  assert.match(configuration, /^listener 8883$/m);
  assert.match(configuration, /^tls_version tlsv1.2$/m);
  assert.match(configuration, /^persistence true$/m);
  for (const name of ['cafile', 'certfile', 'keyfile']) {
    assert.match(configuration, new RegExp(`^${name} /mosquitto/certs/`, 'm'));
  }
  assert.match(acl, /^topic readwrite dt\/campus-lab\/telemetry\/\+\/\+\/\+$/m);
  assert.match(acl, /shellyplugpmg3-48f6eebbf3f4\/rpc/);
  assert.match(acl, /dt-r1-local-backend\/shelly\/rpc/);
  assert.doesNotMatch(acl, /#|\$SYS/);
});

test('optional TLS override reuses an explicit external database volume', () => {
  const override = readFileSync(new URL('../docker/compose.server.yaml', import.meta.url), 'utf8');
  const database = override.split('  mosquitto:')[0];
  assert.match(database, /volumes: !override\s+- postgres-data:\/var\/lib\/postgresql\/data/);
  assert.doesNotMatch(database, /docker-entrypoint-initdb.d|migrations/);
  assert.match(override, /postgres-data:\s+external: true\s+name: \$\{DT_POSTGRES_VOLUME:\?/);
});
