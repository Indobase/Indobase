/**
 * Optional env overrides for per-tenant Docker Compose (edge, realtime, storage).
 * See docker/docs/TENANT_DATA_PLANE_TUNING.md
 */

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
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
