# Scaling checklist (tenant data plane)

Use this when traffic, connection counts, or latency grow. Tuning lives in Studio env (see `TENANT_DATA_PLANE_TUNING.md`); stacks pick up values when compose is regenerated (**Project → Infrastructure → Write compose & apply** or re-provision).

## 1. Postgres connection budget

- **`max_connections`** on the tenant (or shared) Postgres must exceed the **sum** of:
  - PostgREST: `SAAS_TENANT_POSTGREST_DB_POOL` × replicas of `tenant-rest` (usually one per stack).
  - Realtime: `SAAS_TENANT_REALTIME_DB_POOL_SIZE`.
  - Pooler (if used): `SAAS_TENANT_POOLER_MAX_CLIENT_CONN` bounds client side, not server connections to Postgres — still align with pooler docs and DB limits.
  - Storage, GoTrue, meta, and any admin sessions.
- If you raise pools, raise **`max_connections`** (or use PgBouncer in transaction mode) before increasing per-service pools.

## 2. PostgREST (`tenant-rest`)

- **`SAAS_TENANT_POSTGREST_DB_POOL`** — primary lever for concurrent REST queries; keep under the DB budget above.
- **`SAAS_TENANT_POSTGREST_POOL_ACQUISITION_TIMEOUT`** — fail fast when the pool is saturated instead of hanging (seconds).
- **`SAAS_TENANT_POSTGREST_POOL_MAX_IDLETIME`** — shrink idle connections during quiet periods (seconds).
- **`SAAS_TENANT_POSTGREST_DB_MAX_ROWS`** — optional cap on large `SELECT` responses (`0` = unlimited); useful for abuse protection on public APIs.
- **`SAAS_TENANT_POSTGREST_MEM_LIMIT`** — Docker `mem_limit` for large JSON payloads / spikes.

## 3. Edge and Realtime

- Edge: `SAAS_TENANT_EDGE_RUNTIME_MEM_LIMIT` for Deno OOM under load.
- Realtime: `SAAS_TENANT_REALTIME_RLIMIT_NOFILE` for WebSocket fan-out; `SAAS_TENANT_REALTIME_DB_POOL_SIZE` for DB-side concurrency.

## 4. Storage and transforms

- `SAAS_TENANT_STORAGE_FILE_SIZE_LIMIT_BYTES`, imgproxy buffer/timeout — see `TENANT_DATA_PLANE_TUNING.md`.

## 5. Verify after changes

- Apply compose and smoke-test REST, Realtime, and Storage for the tenant.
- Watch Postgres **connection count** and **slow queries**; adjust pools if you see saturation or `pool acquisition timeout` style errors in PostgREST logs.

## 6. Horizontal scale (later)

- Multiple `tenant-rest` replicas require a shared Postgres and consistent routing (same schema); session/transaction stickiness is usually unnecessary for stateless PostgREST reads.
- Read replicas need application-level routing (not covered by default generated compose).
