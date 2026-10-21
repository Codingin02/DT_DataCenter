import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const shell = process.platform === 'win32' ? 'C:/Espressif/tools/git/bin/sh.exe' : '/bin/sh';
const script = readFileSync(new URL('./runtime.sh', import.meta.url), 'utf8');
const commands = `
docker() { printf 'docker'; printf ' <%s>' "$@"; printf '\\n'; }
npm() { printf 'npm'; printf ' <%s>' "$@"; printf '\\n'; }
. "$0"
`;

function run(action, mode, configure = true) {
  const directory = mkdtempSync(join(tmpdir(), 'dt-runtime-test-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    const file = join(directory, 'scripts/runtime.sh');
    writeFileSync(file, script);
    if (configure) {
      writeFileSync(join(directory, '.env'), '');
      writeFileSync(join(directory, '.env.server'), '');
    }
    return spawnSync(shell, ['-c', commands, file, action, mode], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true });
  }
}

test(
  'server startup uses existing images, canonical identity and both Compose files',
  {
    skip: !existsSync(shell),
  },
  () => {
    const result = run('start', 'server');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<--env-file> <.env.server> <-p> <dt_datacenter>/);
    assert.match(result.stdout, /<-f> <docker\/compose.yaml> <-f> <docker\/compose.server.yaml>/);
    assert.match(result.stdout, /<config> <--quiet>/);
    assert.match(result.stdout, /<up> <-d> <--no-build> <--pull> <never> <--wait>/);
    assert.doesNotMatch(result.stdout, /npm|<--build>|<down>|<prune>/);
  }
);

test(
  'local startup preserves frontend build and existing Compose behavior',
  {
    skip: !existsSync(shell),
  },
  () => {
    const result = run('start', 'local');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /npm <run> <frontend:build>/);
    assert.match(result.stdout, /<--build>/);
    assert.doesNotMatch(result.stdout, /compose.server.yaml|.env.server/);
  }
);

test(
  'stop preserves volumes and has a bounded graceful timeout',
  {
    skip: !existsSync(shell),
  },
  () => {
    for (const mode of ['local', 'server']) {
      const result = run('stop', mode);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /<stop> <--timeout> <30>/);
      assert.doesNotMatch(result.stdout, /npm|<up>|<down>|<prune>|<rm>/);
    }
  }
);

test(
  'invalid action/mode and missing private configuration fail before Docker',
  {
    skip: !existsSync(shell),
  },
  () => {
    for (const [action, mode, configure, status] of [
      ['delete', 'server', true, 2],
      ['start', 'other', true, 2],
      ['start', 'server', false, 1],
    ]) {
      const result = run(action, mode, configure);
      assert.equal(result.status, status, result.stderr);
      assert.doesNotMatch(result.stdout, /docker|npm/);
    }
  }
);

test('server broker limits ACL topics and enables authenticated TLS persistence', () => {
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

test('server database reuses an explicit external volume without local initialization SQL', () => {
  const override = readFileSync(new URL('../docker/compose.server.yaml', import.meta.url), 'utf8');
  const database = override.split('  mosquitto:')[0];
  assert.match(database, /volumes: !override\s+- postgres-data:\/var\/lib\/postgresql\/data/);
  assert.doesNotMatch(database, /docker-entrypoint-initdb.d|migrations/);
  assert.match(override, /postgres-data:\s+external: true\s+name: \$\{DT_POSTGRES_VOLUME:\?/);
});
