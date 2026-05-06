# Performance, Reliability & Security Test Reports

These reports are generated from a codebase review plus lightweight verification and are written to be **repeatable** on your Dokploy VPS.

## Index
- `01-api-throughput-latency.md`
- `02-db-query-performance.md`
- `03-cold-start-time.md`
- `04-concurrent-user-load.md`
- `05-autoscaling-behavior.md`
- `06-failure-recovery.md`
- `07-auth-security.md`
- `08-realtime-performance.md`
- `09-dx-onboarding-time.md`
- `10-cost-efficiency-under-load.md`

## Environment assumptions
- **Studio**: `https://studio.indobase.in`
- **API Gateway**: `https://api.indobase.in` (Kong)
- **Tenant domains** (Option A): `https://<project-ref>.indobase.in`
- Dokploy Traefik dynamic dir: `/etc/dokploy/traefik/dynamic`

## Notes
- Some tests require **VPS access** (CPU/mem, container logs, scaling actions, network egress).
- Some “Supabase Cloud” capabilities are **UI-present but backend-external/stubbed** in this repo; reports call that out explicitly.

