import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const backupsDirectory = resolve(repositoryRoot, 'backups');
const foundationTest = resolve(repositoryRoot, 'database/tests/foundation.sql');

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function configuration() {
  const port = required('PGPORT');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PGPORT must be an integer between 1 and 65535.');
  }

  const database = required('PGDATABASE');
  if (database !== 'DT_DataCenter') {
    throw new Error('PGDATABASE must be the canonical DT_DataCenter database.');
  }

  return {
    host: required('PGHOST'),
    port,
    user: required('PGUSER'),
    database,
  };
}

function isWithin(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function backupFile() {
  const file = resolve(repositoryRoot, required('PG_BACKUP_FILE'));
  if (file === backupsDirectory) {
    throw new Error('PG_BACKUP_FILE must identify a file.');
  }
  if (isWithin(repositoryRoot, file) && !isWithin(backupsDirectory, file)) {
    throw new Error('PG_BACKUP_FILE must be outside the repository or under backups/.');
  }
  return file;
}

function connectionArguments(connection, database) {
  return [
    '--host',
    connection.host,
    '--port',
    connection.port,
    '--username',
    connection.user,
    '--dbname',
    database,
    '--no-password',
  ];
}

function run(tool, arguments_, { quiet = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(tool, arguments_, {
      env: process.env,
      shell: false,
      stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
      windowsHide: true,
    });
    child.once('error', (error) => {
      rejectPromise(new Error(`${tool} could not start (${error.code ?? 'unknown error'}).`));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else if (signal) {
        rejectPromise(new Error(`${tool} terminated by ${signal}.`));
      } else {
        rejectPromise(new Error(`${tool} failed with exit code ${code}.`));
      }
    });
  });
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function createBackup() {
  const connection = configuration();
  const file = backupFile();
  if (await exists(file)) {
    throw new Error('PG_BACKUP_FILE already exists; refusing to overwrite it.');
  }

  await mkdir(dirname(file), { recursive: true });
  const partialFile = `${file}.partial-${randomUUID()}`;
  try {
    await run('pg_dump', [
      '--format=custom',
      ...connectionArguments(connection, connection.database),
      '--file',
      partialFile,
    ]);
    await run('pg_restore', ['--list', partialFile], { quiet: true });
    await copyFile(partialFile, file, constants.COPYFILE_EXCL);
  } catch (error) {
    await rm(partialFile, { force: true }).catch(() => {});
    throw error;
  }
  await rm(partialFile, { force: true });
  console.info(`PostgreSQL backup created: ${file}`);
}

function restoreDatabase() {
  const database = required('PGRESTORE_DATABASE');
  if (!/^dt_datacenter_restore_[a-z0-9_]+$/.test(database) || database.length > 63) {
    throw new Error(
      'PGRESTORE_DATABASE must be a disposable name beginning with dt_datacenter_restore_.'
    );
  }
  return database;
}

async function verifyRestore() {
  const connection = configuration();
  const file = backupFile();
  const targetDatabase = restoreDatabase();
  if (targetDatabase.toLowerCase() === connection.database.toLowerCase()) {
    throw new Error('PGRESTORE_DATABASE must differ from PGDATABASE.');
  }
  if (!(await exists(file))) {
    throw new Error('PG_BACKUP_FILE does not exist.');
  }

  await run('pg_restore', ['--list', file], { quiet: true });
  let created = false;
  let failure;
  try {
    await run('createdb', [
      '--host',
      connection.host,
      '--port',
      connection.port,
      '--username',
      connection.user,
      '--no-password',
      '--maintenance-db',
      connection.database,
      '--template',
      'template0',
      '--owner',
      connection.user,
      targetDatabase,
    ]);
    created = true;
    await run('pg_restore', [
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-privileges',
      ...connectionArguments(connection, targetDatabase),
      file,
    ]);
    await run('psql', [
      '-X',
      '--set',
      'ON_ERROR_STOP=1',
      '--set',
      'FOUNDATION_ALREADY_APPLIED=1',
      ...connectionArguments(connection, targetDatabase),
      '--file',
      foundationTest,
    ]);
  } catch (error) {
    failure = error;
  }

  if (created) {
    try {
      await run('dropdb', [
        '--host',
        connection.host,
        '--port',
        connection.port,
        '--username',
        connection.user,
        '--no-password',
        '--maintenance-db',
        connection.database,
        targetDatabase,
      ]);
    } catch (cleanupError) {
      if (failure) {
        console.error(`Disposable database cleanup also failed: ${targetDatabase}.`);
      } else {
        failure = cleanupError;
      }
    }
  }

  if (failure) throw failure;
  console.info('PostgreSQL restore verification passed.');
}

try {
  const action = process.argv[2];
  if (action === 'backup') {
    await createBackup();
  } else if (action === 'verify') {
    await verifyRestore();
  } else {
    throw new Error('Usage: node scripts/postgres-backup.js <backup|verify>.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'PostgreSQL backup operation failed.');
  process.exitCode = 1;
}
