# Tenant backups — operations runbook

Per-tenant **logical** backups: a scheduled `pg_dump -Fc` of each `tenantdb_<ref>` streamed to
S3/MinIO, restorable independently. PITR is **not** available — WAL is cluster-wide across all
tenant databases, so there is no per-project point-in-time recovery. Daily logical dumps with
plan-based retention are the offering.

## Architecture

```
Studio cron (/api/cron/run-backups)
  → lists backup-eligible projects (plan.backupRetentionDays > 0, has a dedicated tenant DB)
  → for each: inserts a saas.project_backups row, calls provisioner /backup-tenant
Provisioner (/backup-tenant)
  → docker run postgres:16-alpine pg_dump -Fc <db>  |  docker run amazon/aws-cli s3 cp - s3://…
  → returns { ok, size_bytes }
Studio → finalises the row (completed/failed), then prunes dumps past retention_until
```

The provisioner needs no new binaries: `pg_dump`/`pg_restore` come from a throwaway
`postgres:16-alpine` container, the transfer from `amazon/aws-cli`, piped through the process.

## Retention (from `plan-entitlements.ts`)

| Plan | Retention |
|------|-----------|
| Free, Basic | none |
| Pro | 7 days |
| Studio | 14 days |
| Enterprise, Platform | 30 days |

## Required configuration

**On the provisioner service** (object storage; reuses the MinIO creds if the `BACKUP_*` vars are unset):

- `BACKUP_S3_BUCKET` (or falls back to `S3_BUCKET`)
- `BACKUP_S3_ENDPOINT` — MinIO/S3 endpoint URL (omit for AWS S3)
- `BACKUP_S3_REGION` (default `us-east-1`)
- `BACKUP_S3_ACCESS_KEY_ID` (or falls back to `S3_PROTOCOL_ACCESS_KEY_ID`)
- `BACKUP_S3_SECRET_ACCESS_KEY` (or falls back to `S3_PROTOCOL_ACCESS_KEY_SECRET`)

The provisioner already has `POSTGRES_PASSWORD` + `PROVISIONER_PG_*`, used for `pg_dump`.

**On Studio**: `DATA_PLANE_PROVISIONER_URL` / `DATA_PLANE_PROVISIONER_TOKEN` (already set), and
`CRON_SECRET` to protect the cron route.

## Schedule the cron (daily)

```
0 3 * * * root curl -fsS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://studio.indobase.in/api/cron/run-backups >> /var/log/indobase-backups.log 2>&1
```

- `POST /api/cron/run-backups` — back up all eligible tenants, then prune expired
- `POST /api/cron/run-backups?prune=only` — prune only
- `POST /api/cron/run-backups?ref=<ref>` — one project, on demand

## Restore (destructive — overwrites the tenant DB)

There is intentionally no unauthenticated restore endpoint. Restore is run deliberately by an
operator against the provisioner:

```
curl -X POST -H "Authorization: Bearer $DATA_PLANE_PROVISIONER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"db_name":"tenantdb_<ref>","object_key":"backups/<ref>/<backup-id>.dump"}' \
  http://<provisioner>:8787/restore-tenant
```

`pg_restore --clean --if-exists` drops and recreates objects — the tenant's current data is
replaced by the dump. Confirm the target `db_name` before running.

## Before you rely on this

1. **Set the `BACKUP_S3_*` env** on the provisioner and redeploy it. Without it, `/backup-tenant`
   returns `{ ok: false, error: 'Backup storage not configured' }` and rows are marked failed.
2. **Run one backup and one restore end-to-end.** An untested backup is not a backup. Verify a
   dump lands in the bucket, then restore it into a throwaway DB and confirm the data.
3. **Only then** re-enable customer-facing backup claims with confidence (the pricing lines are
   already wired to `backupRetentionDays`).

## Known limitations

- A `pg_dump` that fails mid-stream may leave a partial object in the bucket; the DB row is marked
  `failed` but the orphan object is not auto-removed. Low impact; a periodic bucket sweep can catch these.
- Backups are cluster-load-bearing (they read the shared Postgres). The cron runs them sequentially
  and off-peak (03:00) for this reason.
