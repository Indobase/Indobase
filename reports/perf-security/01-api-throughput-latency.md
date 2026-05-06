# 01) API Throughput & Latency

Generated: 2026-05-06  
Targets: `api.indobase.in` (Kong), and optionally `/<project-ref>.indobase.in` tenant endpoints

## Goal
Measure HTTP request throughput and tail latency (p50/p95/p99) for key API surfaces:
- REST (`/rest/v1`)
- Auth (`/auth/v1`)
- Storage (`/storage/v1`)
- Functions (`/functions/v1`)

## What exists in this codebase
### Present
- Kong gateway with per-project attribution (subdomain → `x-project-ref`)
  - `docker/volumes/api/kong.yml` (global `pre-function`)
- MVP per-project quotas (Kong `rate-limiting` keyed by `x-project-ref`)
  - `docker/volumes/api/kong.yml`
- Vector parses Kong access logs for host + project attribution
  - `docker/volumes/logs/vector.yml`

### Gaps / caveats
- If `api.indobase.in` is protected by Basic Auth (401 observed), benchmarks must hit an endpoint that returns 200 without auth or supply auth headers.
- For true Supabase-Cloud parity, you should benchmark **tenant endpoints** (`<ref>.indobase.in`) because that’s where isolation and per-project stacks live.

## Recommended methodology
- **Warm-up**: 30–60s at low concurrency
- **Main run**: 3–10 minutes per endpoint at multiple concurrencies (e.g., 10, 50, 100)
- Collect: status code distribution, p50/p95/p99 latency, throughput, error rate

## How to run (VPS)
### Tool options
- `k6` (recommended for repeatable runs + JSON output)
- `wrk` / `hey` (quick ad-hoc)

### k6 example (template)
Create `k6-api.js`:

```js
import http from 'k6/http'
import { sleep } from 'k6'

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '3m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
  },
}

export default function () {
  const url = __ENV.URL
  const headers = {}
  // If testing tenant domains:
  // headers['x-project-ref'] = __ENV.PROJECT_REF
  http.get(url, { headers })
  sleep(1)
}
```

Run:

```bash
URL="https://<project-ref>.indobase.in/rest/v1/" VUS=50 DURATION=3m k6 run k6-api.js
```

## What to capture in the report
- Environment snapshot:
  - VPS CPU/RAM, docker version, Traefik/Kong versions
- For each endpoint and concurrency:
  - p50/p95/p99 latency
  - RPS / throughput
  - error rate + top error codes
- Correlate with logs:
  - Kong access logs (Vector tagging by `.metadata.project_ref`)

## Pass/fail (starter targets)
For a single VPS (non-autoscaling), good baseline targets:
- p95 < 500ms for simple GETs
- errors < 1%
Adjust once you have real workload + DB migrations in tenant DBs.

