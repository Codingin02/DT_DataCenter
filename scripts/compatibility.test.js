import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const shCmd = process.platform === 'win32' ? 'sh' : '/bin/sh';

test('compatibility setup and runtime delegate to one Linux deployment without changing devices', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt compatibility '));
  try {
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'deployment/linux'), { recursive: true });
    for (const name of ['runtime.sh', 'setup-linux.sh']) {
      copyFileSync(new URL(name, import.meta.url), join(dir, 'scripts', name));
    }
    for (const action of ['start', 'stop', 'status', 'install']) {
      writeFileSync(
        join(dir, `deployment/linux/${action}.sh`),
        `printf 'delegated-${action}\\n'\n`
      );
    }
    for (const [file, args, expected] of [
      ['runtime.sh', ['start', 'server'], 'delegated-start'],
      ['runtime.sh', ['stop', 'local'], 'delegated-stop'],
      ['runtime.sh', ['status', 'server'], 'delegated-status'],
      ['setup-linux.sh', [], 'delegated-install'],
    ]) {
      const result = spawnSync(shCmd, [join(dir, 'scripts', file), ...args], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(expected));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Shelly configuration tool requires explicit permission before discovery or reconfiguration', () => {
  const result = spawnSync(shCmd, [fileURLToPath(new URL('shelly-sync.sh', import.meta.url))], {
    encoding: 'utf8',
    env: { ...process.env, DT_ALLOW_DEVICE_RECONFIGURATION: '' },
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Searching|Updating|rebooted/);
  assert.match(
    readFileSync(new URL('shelly-sync.sh', import.meta.url), 'utf8'),
    /DT_ALLOW_DEVICE_RECONFIGURATION/
  );
});

test('Shelly tool refuses missing or invalid explicit device addresses without network access', () => {
  const script = fileURLToPath(new URL('shelly-sync.sh', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'dt shelly test '));
  try {
    for (const name of ['curl', 'getent', 'ip', 'hostname']) {
      writeFileSync(
        join(directory, name),
        '#!/bin/sh\necho UNEXPECTED_NETWORK_ACCESS >&2\nexit 99\n',
        { mode: 0o755 }
      );
    }
    for (const args of [
      [],
      ['192.168.1.167'],
      ['192.168.1.167', '1'],
      ['192.168.1.167', '192.168.1.999'],
    ]) {
      const result = spawnSync(shCmd, [script, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DT_ALLOW_DEVICE_RECONFIGURATION: '1',
          PATH: `${directory}:${process.env.PATH}`,
        },
      });
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED_NETWORK_ACCESS/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
