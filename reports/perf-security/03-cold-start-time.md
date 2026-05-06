# 03) Cold Start Time (Serverless / Edge)

Generated: 2026-05-06  
Scope: Edge Functions runtime and any serverless-like components deployed on Dokploy.

## Goal
Measure “cold start” latency for:
- Edge Functions (`/functions/v1/*`)
- Any other on-demand services (if you run per-tenant stacks that sleep/scale-to-zero)

## What exists in this codebase
- Edge runtime is included in docker compose:
  - `docker/docker-compose.yml` (`functions` service uses `supabase/edge-runtime`)

## Gaps / caveats
- Dokploy on a single VPS is typically **always-on containers** (not scale-to-zero), so “cold start”
  mostly means:
  - first request after deploy/restart
  - first request after an idle period if your runtime self-idles
- True “serverless cold start” requires infrastructure behavior not present in this repo (K8s/Keda/Knative).

## Recommended methodology
1) Restart the functions container (or tenant functions container).
2) Immediately hit a known function endpoint N times.
3) Record:
   - first-request latency
   - subsequent steady-state latency

## How to run (VPS)
Example:

```bash
time curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://<project-ref>.indobase.in/functions/v1/<fn>
```

Repeat 10–30 times after restart to capture distribution.

## What to capture in the report
- Restart method (deploy vs container restart)
- first request latency vs steady state p95
- CPU/mem at time of cold start

## Findings (current state)
- Containers are always-on by default, so cold start benchmarking is possible but is not the same
  as true serverless scale-to-zero behavior.

