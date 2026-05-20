# Tenant data plane tuning (Edge, Realtime, Storage)

Indobase generates per-project `docker-compose.yml` from Studio. You can tune **cold-start resilience**, **Realtime concurrency**, and **storage / image transforms** without forking the generator by setting these on the **Studio** host (they are read when compose YAML is built).

| Env var | Default | Service | Effect |
|--------|---------|---------|--------|
| `SAAS_TENANT_EDGE_RUNTIME_MEM_LIMIT` | `512m` | `tenant-functions` | Docker `mem_limit` for Deno edge-runtime (reduces OOM under concurrent invocations). |
| `SAAS_TENANT_REALTIME_RLIMIT_NOFILE` | `50000` | `tenant-realtime` | Raises OS fd limit for WebSocket-heavy workloads. |
| `SAAS_TENANT_REALTIME_DB_POOL_SIZE` | `24` | `tenant-realtime` | DB pool size for Realtime ↔ Postgres. |
| `SAAS_TENANT_STORAGE_FILE_SIZE_LIMIT_BYTES` | `5368709120` (5 GiB) | `tenant-storage` | Max object size for Storage API. |
| `SAAS_TENANT_IMGPROXY_DOWNLOAD_BUFFER_BYTES` | `1048576` | `tenant-imgproxy` | Buffer for image download/transform pipeline. |
| `SAAS_TENANT_IMGPROXY_DOWNLOAD_TIMEOUT_SECONDS` | `30` | `tenant-imgproxy` | Network timeout when reading from storage. |

After changing Studio env, **re-provision** or use **Project → Infrastructure → Write compose & apply** so new stacks pick up values.

## Multi-runtime functions (Node / Python)

Edge containers remain **Deno**. For Node or Python workloads, use one of:

1. **HTTP worker** — Edge function forwards to your own service (Fly.io, Cloud Run, VPS) with `fetch()`.
2. **Separate compose service** — Add a sibling container on `tenant_data_plane` and call it from Edge or from the app over the internal network.

See `docker/docs/MULTI_RUNTIME_EDGE_FUNCTIONS.md` for a minimal proxy pattern.
