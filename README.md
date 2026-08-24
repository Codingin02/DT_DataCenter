# Digital Twin

Digital Twin Data Center Laboratory

## PostgreSQL backup verification

Set the PostgreSQL environment variables from `.env.example`. `PG_BACKUP_FILE` must not
already exist, and `PGRESTORE_DATABASE` must identify a disposable database that does
not already exist.

```text
npm run backup:database
npm run test:database:restore
```

The backup uses PostgreSQL custom format. Restore verification creates the disposable
database, restores the archive in one transaction, runs the foundation database checks,
and removes only the database it created.
