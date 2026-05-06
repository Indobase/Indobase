# 08) Realtime System Performance

Generated: 2026-05-06

## Goal
Benchmark realtime:
- connection establishment latency
- concurrent WebSocket connections
- message fanout latency + throughput
- disconnect/reconnect stability

## What exists in this codebase
- Realtime service exists in `docker/docker-compose.yml` (shared stack).
- Option A tenant stacks also include a `tenant-realtime` service in generated artifacts:
  - `docker/tenants/render-tenant-stack.mjs`
  - `apps/studio/lib/api/self-hosted/platform.ts` (`getTenantStackArtifacts()`)

## Major gap (functional)
Current generated tenant stack can be inconsistent about which DB realtime uses vs rest/auth/storage
unless you unify DB configuration. Until tenant DB bootstrap + single-DB wiring is fixed, realtime benchmarks
may not represent the final architecture.

## Recommended methodology
### A) Handshake latency
Measure time to open WS connection (p50/p95/p99).

### B) Concurrency
Ramp from 100 → 1k → 10k connections (depending on VPS limits).
Track:
- handshake failures
- memory growth
- CPU saturation

### C) Fanout
Publish messages to a channel; measure delivery latency across subscribers.

## Tools
Typical:
- k6 websocket module
- artillery websocket
- custom node ws script

## Evidence to capture
- number of concurrent connections sustained
- drop rate, reconnect behavior
- CPU/memory
- DB load for realtime

