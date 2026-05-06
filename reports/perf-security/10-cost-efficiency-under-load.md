# 10) Cost Efficiency Under Load

Generated: 2026-05-06  
Deployment: Dokploy on Hostinger VPS

## Goal
Quantify cost efficiency:
- cost per 1M requests (REST/Auth)
- cost per GB-month stored (storage)
- cost per GB egress
- cost per 1k function invocations
- cost per 1k realtime connections/minute

## What exists in this codebase
### Usage schema + aggregation (partially implemented)
- Usage tracking schema:
  - `supabase/migrations/0001_usage_tracking_schema.sql`
- Usage collector/aggregator:
  - `supabase/functions/usage-collector/index.ts` (several placeholders)
  - `supabase/functions/usage-aggregator/index.ts` (aggregation logic)
- Quota enforcer:
  - `supabase/functions/quota-enforcer/index.ts` (hard enforcement placeholder)

### Gateway attribution (MVP)
- Kong tags by `x-project-ref` and rate limits per project:
  - `docker/volumes/api/kong.yml`

## Gaps
- To compute cost efficiency you need:
  - accurate metering collectors (requests/egress/storage/db size/realtime/functions)
  - a pricing model per plan
  - infrastructure cost inputs (Hostinger VPS costs, storage costs, bandwidth)
None of that is fully implemented in self-hosted mode yet.

## Recommended methodology (practical)
1) Define your unit costs:
   - VPS monthly cost
   - storage cost (disk or object storage)
   - bandwidth cost (if any)
2) Drive load for a fixed time window (e.g., 30 minutes).
3) Capture:
   - total requests served
   - avg CPU utilization
   - peak RAM
   - egress bytes
4) Allocate cost proportionally (simple) or via resource accounting (better).

## Evidence to capture
- Load test output (RPS, error rate)
- VPS resource metrics (CPU/RAM/disk i/o)
- network egress counters
- per-project request attribution from Kong logs

## Findings (current state)
You have the foundation (schema + aggregator + gateway attribution), but you still need:
- real collectors
- hard enforcement integration
- plan/pricing and billing lifecycle to expose “cost efficiency” in product terms

