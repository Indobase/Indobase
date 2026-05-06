# 04) Concurrent User Load Test

Generated: 2026-05-06

## Goal
Simulate concurrent user workflows across Studio + API:
- Sign-in
- List orgs/projects
- Open project overview
- Run a simple REST query
- Optional: realtime connect + storage list

## What exists in this codebase
- Studio is a Next.js app with authenticated routes.
- API flows go through Kong and (Option A) per-tenant endpoints.

## Gaps / caveats
- Running a realistic “user journey” load test requires stable test users + seeded org/projects.
- If `api.indobase.in` is Basic-Auth protected at gateway level, user journey tests must target tenant endpoints
  or include the gateway auth.

## Recommended methodology
- Use k6 “scenarios” with:
  - a ramp-up stage
  - steady state
  - ramp-down
- Track:
  - end-to-end step latency
  - error rate
  - CPU/mem utilization on VPS

## How to run (VPS)
### k6 journey skeleton

```js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 0 },
  ],
}

export default function () {
  const base = __ENV.BASE
  const r = http.get(`${base}/sign-in`)
  check(r, { 'sign-in page ok': (x) => x.status === 200 || x.status === 307 })
  sleep(1)
}
```

Run:

```bash
BASE=https://studio.indobase.in k6 run journey.js
```

## Findings (current state)
No in-repo “journey load test harness” is present today; this report provides a repeatable starting point.

