import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function linux(action, extra = [], configured = true, environment = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'Digital Twin deployment '));
  try {
    mkdirSync(join(dir, 'deployment/linux'), { recursive: true });
    mkdirSync(join(dir, 'bin'));
    let bashEnv = '';
    if (action === 'update') {
      writeFileSync(join(dir, 'deployment/linux/backup.sh'), '#!/bin/sh\necho backup-fixture\n');
      writeFileSync(join(dir, 'bin/git'), '#!/bin/sh\nif [ "$1" = branch ]; then echo main; fi\n', {
        mode: 0o755,
      });
      if (process.platform === 'win32') {
        const envScript = join(dir, 'bash_env.sh');
        writeFileSync(
          envScript,
          'git() { if [ "$1" = branch ]; then echo main; fi; }\nexport -f git\n'
        );
        bashEnv = envScript.replace(/\\/g, '/');
      }
    }
    for (const file of ['manage.sh', `${action}.sh`]) {
      copyFileSync(new URL(`deployment/linux/${file}`, root), join(dir, 'deployment/linux', file));
    }
    if (configured) writeFileSync(join(dir, '.env.server'), 'POSTGRES_PASSWORD=test-only\n');
    writeFileSync(
      join(dir, 'bin/docker'),
      '#!/bin/sh\nprintf "<%s> " "$@"\nprintf "\\n"\ncase "$*" in *"nginx nginx -t"*) [ "${DT_TEST_FAIL_VALIDATE:-0}" != 1 ] || exit 9 ;; esac\n',
      {
        mode: 0o755,
      }
    );
    const bashCmd =
      process.platform === 'win32'
        ? ['D:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/bin/bash.exe'].find((p) => {
            try {
              return readFileSync(p) && true;
            } catch {
              return false;
            }
          }) || 'bash'
        : '/bin/bash';
    const posixBin = join(dir, 'bin').replace(/\\/g, '/');
    return spawnSync(bashCmd, [join(dir, `deployment/linux/${action}.sh`), ...extra], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DT_ENV_FILE: '',
        BASH_ENV: bashEnv,
        PATH: `${posixBin}:${process.env.PATH}`,
        ...environment,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Linux start uses a space-safe root, private env, explicit OS override and health wait', () => {
  const result = linux('start');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<--env-file> <[^>]+\.env.server>/);
  assert.match(result.stdout, /compose\.linux\.yaml/);
  assert.match(result.stdout, /<up> <-d> <--no-build> <--wait>/);
  assert.doesNotMatch(result.stdout, /<down>|<prune>|<--force-recreate>/);
});

test('Linux stop preserves data and missing env fails closed', () => {
  const stopped = linux('stop');
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.match(stopped.stdout, /<stop> <--timeout> <30>/);
  assert.doesNotMatch(stopped.stdout, /<down>|<--volumes>|<rm>/);
  const missing = linux('start', [], false);
  assert.notEqual(missing.status, 0);
  assert.doesNotMatch(missing.stdout, /<compose>/);
});

test('restore refuses operational or malformed targets before touching Docker', () => {
  for (const target of ['DT_DataCenter', 'postgres', 'dt_datacenter_restore_x;DROP']) {
    const result = linux('restore', ['missing.dump', target]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /<compose>/);
  }
});

test('OS overrides preserve MQTT data and Windows disables Linux host exporter', () => {
  const windows = read('docker/compose.windows.yaml');
  const linuxConfig = read('docker/compose.linux.yaml');
  assert.match(windows, /node-exporter:[\s\S]*profiles: \['linux-only'\]/);
  assert.match(windows, /HOST_EXPORTER_PLATFORM: windows/);
  assert.match(linuxConfig, /HOST_EXPORTER_PLATFORM: linux/);
  for (const name of ['windows', 'linux']) {
    assert.match(read(`docker/compose.${name}.yaml`), /mqtt-data:\/mosquitto\/data/);
  }
  assert.match(read('docker/mosquitto/persistent.conf'), /^persistence true$/m);
});

test('public gateway is separate from LAN and denies administration and metrics by default', () => {
  const config = read('infra/nginx/funnel.conf');
  assert.match(
    config,
    /location = \/api\/spatial-registration\s*\{\s*limit_except GET\s*\{\s*deny all;\s*\}/
  );
  assert.match(config, /location = \/metrics\s*\{\s*return 404;/);
  assert.match(config, /location \/api\/\s*\{\s*return 404;/);
  assert.match(config, /proxy_buffering off/);
  const override = read('docker/compose.funnel.yaml');
  assert.match(override, /127\.0\.0\.1:8080:8080/);
  assert.match(read('deployment/linux/funnel.sh'), /DT_PUBLIC_READONLY_APPROVED/);
});

test('Windows wrapper uses Compose OS override, handles exit status and never erases volumes', () => {
  const config = read('deployment/windows/manage.ps1');
  assert.match(config, /compose\.windows\.yaml/);
  assert.match(config, /LASTEXITCODE/);
  assert.match(config, /--wait/);
  assert.doesNotMatch(config, /down\s+-v|volume\s+prune|\/opt\//);
});

test('build context and ignore rules protect recovered secrets and database archives', () => {
  const ignore = read('.gitignore');
  for (const entry of [
    'local_config.h',
    '*.dump',
    '*.key',
    'config/private/',
    'deployment/resources/',
  ]) {
    assert.ok(ignore.includes(entry), entry);
  }
  const docker = read('.dockerignore');
  assert.match(docker, /\.env/);
  assert.doesNotMatch(docker, /!node_modules/);
});

test('Windows exporter uses a supported MSI feature without automatic service startup', () => {
  const installer = read('deployment/windows/install-monitoring.ps1');
  assert.match(installer, /ADDLOCAL=DefaultFeature/);
  assert.doesNotMatch(installer, /ADDLOCAL=MainFeature|ADDLOCAL=ALL/);
  assert.match(installer, /Set-Service\s+windows_exporter\s+-StartupType\s+Manual/);
  assert.match(installer, /StartMode/);
});

test('updates validate bound configuration then recreate broker and gateway explicitly', () => {
  for (const path of ['deployment/linux/manage.sh', 'deployment/windows/manage.ps1']) {
    const script = read(path);
    assert.match(script, /nginx nginx -t/);
    assert.match(script, /--test-config/);
    assert.match(script, /--force-recreate --wait --wait-timeout 120 mosquitto backend nginx/);
  }
});

test('production transitive URI parsers are locked beyond known vulnerable releases', () => {
  const packages = JSON.parse(read('package-lock.json')).packages;
  for (const [name, minimum] of [
    ['fast-uri', [3, 1, 9]],
    ['ip-address', [10, 7, 4]],
  ]) {
    const actual = packages[`node_modules/${name}`].version.split('.').map(Number);
    assert.ok(
      actual[0] > minimum[0] ||
        (actual[0] === minimum[0] &&
          (actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]))),
      name
    );
  }
});

test('Linux update validates new Nginx config before service recreation and stops on invalid config', () => {
  const result = linux('update');
  assert.equal(result.status, 0, result.stderr);
  const validation = result.stdout.indexOf('<nginx> <nginx> <-t>');
  const recreation = result.stdout.indexOf('<--force-recreate>');
  assert.ok(validation >= 0 && recreation > validation);
  const invalid = linux('update', [], true, { DT_TEST_FAIL_VALIDATE: '1' });
  assert.notEqual(invalid.status, 0);
  assert.doesNotMatch(invalid.stdout, /<up>/);
});

test('npm cache configuration is portable and excluded from publication', () => {
  assert.match(read('.npmrc'), /^cache=\.cache\/npm$/m);
  assert.match(read('.gitignore'), /^\.cache\/$/m);
});

test('deploy orchestrator enforces staging isolation, missing env failsafe, safe rollback and funnel isolation', () => {
  const deploy = read('deployment/linux/deploy.sh');
  assert.match(deploy, /umask 077/);
  assert.match(deploy, /chmod 700 "\$STAGING_DIR"/);
  assert.match(deploy, /--exclude='\.env\*'/);
  assert.match(deploy, /--exclude='config\/private\/'/);
  assert.match(deploy, /find "\$STAGING_DIR" -name '\.env\*'/);
  assert.doesNotMatch(deploy, /cp "\$STAGING_DIR\/\.env\.server"/);
  assert.match(deploy, /FATAL: File \$TARGET_DIR\/\.env\.server tidak ditemukan/);
  assert.match(deploy, /CATATAN KEAMANAN DATABASE POSTGRESQL/);
  assert.doesNotMatch(deploy, /createdb.*\$TARGET_DIR/);
  assert.match(deploy, /nginx nginx -t/);
  assert.match(deploy, /up -d --no-build --force-recreate --wait --wait-timeout 30 nginx/);
});
