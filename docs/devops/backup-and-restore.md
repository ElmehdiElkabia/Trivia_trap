# PostgreSQL backup and restore

The `backup` service creates a custom-format PostgreSQL dump immediately when it starts, then once per hour by default.

## Backup policy

- Location: `postgres_backups` Docker volume, mounted at `/backups`.
- Filename: `trivia_YYYYMMDD_HHMMSS.dump` in UTC.
- Interval: `BACKUP_INTERVAL_SECONDS`, default `3600` seconds.
- Retention: `BACKUP_RETENTION_DAYS`, default 7 days.
- Health: the latest successful backup must be newer than `BACKUP_MAX_AGE_SECONDS`, default 7200 seconds.

The backup service receives the database password through Vault Agent. The password is not stored in Compose metadata.

## Check or force a backup

```bash
docker compose logs --tail=20 backup
docker compose exec -T backup sh -c 'ls -lh /backups/trivia_*.dump'
```

Restarting the service creates a backup immediately:

```bash
docker compose restart backup
docker compose logs --tail=20 backup
```

The status is also available at `https://localhost:8443/backup-status`.

## Safe restore demonstration

List the dumps and choose a filename:

```bash
docker compose exec -T backup sh -c 'ls -lh /backups/trivia_*.dump'
```

Restore it:

```bash
docker compose exec -T backup \
  /usr/local/bin/restore.sh trivia_YYYYMMDD_HHMMSS.dump
```

With no database argument, the script restores into `${POSTGRES_DB}_restore_test`. It drops and recreates only that test database, runs `pg_restore`, and verifies the result with `SELECT 1`.

The script refuses to replace the live database unless `CONFIRM_RESTORE=YES` is explicitly supplied. Use the temporary restore database during evaluation to avoid data loss.

## Automated verification

```bash
sh infra/tests/test-minor.sh
```

This validates backup health and integrity, restores into the temporary database, queries it, and removes it afterward.
