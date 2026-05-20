/**
 * Optional env overrides for per-tenant Docker Compose (PostgREST, edge, realtime, storage).
 * See docker/docs/TENANT_DATA_PLANE_TUNING.md and docker/docs/SCALING_CHECKLIST.md
 */

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** PostgREST ↔ Postgres connection pool size (per tenant-rest container). */
export function tenantPostgrestDbPool(): string {
  return String(parsePositiveInt(process.env.SAAS_TENANT_POSTGREST_DB_POOL, 40))
}

/** Seconds to wait for a free pool connection before failing the request. */
export function tenantPostgrestPoolAcquisitionTimeout(): string {
  return String(parsePositiveInt(process.env.SAAS_TENANT_POSTGREST_POOL_ACQUISITION_TIMEOUT, 15))
}

/** Seconds before idle pool connections are closed. */
export function tenantPostgrestPoolMaxIdletime(): string {
  return String(parsePositiveInt(process.env.SAAS_TENANT_POSTGREST_POOL_MAX_IDLETIME, 120))
}

/**
 * Cap very large SELECT responses (`PGRST_DB_MAX_ROWS`). `0` = unlimited (default).
 * Set e.g. `100000` for abuse protection on public APIs.
 */
export function tenantPostgrestDbMaxRows(): string {
  const raw = process.env.SAAS_TENANT_POSTGREST_DB_MAX_ROWS?.trim()
  if (raw === undefined || raw === '') return '0'
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return '0'
  return String(n)
}

/** Memory cap for PostgREST (large JSON payloads). */
export function tenantPostgrestMemLimit(): string {
  const v = process.env.SAAS_TENANT_POSTGREST_MEM_LIMIT?.trim()
  if (v && /^\d+([mMgG])$/.test(v)) return v
  return '512m'
}

/** Docker Compose mem_limit for edge-runtime (e.g. 512m, 1g). Larger = fewer OOMs under load. */
export function tenantEdgeRuntimeMemLimit(): string {
  const v = process.env.SAAS_TENANT_EDGE_RUNTIME_MEM_LIMIT?.trim()
  if (v && /^\d+([mMgG])$/.test(v)) return v
  return '512m'
}

/** Erlang / OS file descriptor ceiling for Realtime (WebSocket fan-out). */
export function tenantRealtimeRlimitNofile(): string {
  return String(parsePositiveInt(process.env.SAAS_TENANT_REALTIME_RLIMIT_NOFILE, 50_000))
}

/** Realtime DB connection pool (Phoenix ↔ Postgres). */
export function tenantRealtimeDbPoolSize(): string {
  return String(parsePositiveInt(process.env.SAAS_TENANT_REALTIME_DB_POOL_SIZE, 24))
}

/** Storage API max upload size in bytes (default 5 GiB). */
export function tenantStorageFileSizeLimitBytes(): string {
  const def = 5_368_709_120
  return String(parsePositiveInt(process.env.SAAS_TENANT_STORAGE_FILE_SIZE_LIMIT_BYTES, def))
}

/** imgproxy download buffer — larger helps big originals during transform. */
export function tenantImgproxyDownloadBufferBytes(): string {
  return String(parsePositiveInt(process.env.SAAS_TENANT_IMGPROXY_DOWNLOAD_BUFFER_BYTES, 1_048_576))
}

/** imgproxy read timeout in seconds when fetching from storage. */
export function tenantImgproxyDownloadTimeoutSeconds(): string {
  return String(parsePositiveInt(process.env.SAAS_TENANT_IMGPROXY_DOWNLOAD_TIMEOUT_SECONDS, 30))
}
