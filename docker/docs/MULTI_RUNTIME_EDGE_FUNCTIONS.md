# Multi-runtime workloads with Indobase Edge Functions

Indobase tenant stacks ship **Supabase Edge Runtime** (Deno). That is the right default for a secure, sandboxed serverless model, but many teams need **Node** (npm ecosystem) or **Python** (ML, data).

## Recommended pattern: thin Edge + heavy worker

1. Deploy your Node or Python API on infrastructure you control (same VPC, Fly.io, Railway, EC2, etc.).
2. In the Edge function, validate the JWT (or rely on `Authorization` from the client), then `fetch()` your worker with a shared secret header.
3. Return the worker response to the client.

Benefits:

- You keep **one** public URL shape (`/functions/v1/...`) on the project host.
- Sandboxed Edge stays small; long CPU / native deps live on the worker.
- You can scale workers independently.

## Example (sketch)

```typescript
// supabase/functions/acme/index.ts
Deno.serve(async (req) => {
  const url = Deno.env.get('ACME_WORKER_URL')!
  const secret = Deno.env.get('ACME_WORKER_HMAC_SECRET')!
  const body = await req.text()
  const sig = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body + secret)
  )
  const upstream = await fetch(url, {
    method: req.method,
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      'x-acme-signature': [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join(''),
    },
    body,
  })
  return new Response(await upstream.text(), { status: upstream.status })
})
```

Set `ACME_WORKER_URL` / `ACME_WORKER_HMAC_SECRET` in the Edge runtime environment (compose `environment` block for `tenant-functions`).

## Optional: add a sibling service in compose

For self-hosted operators who want everything on one host, extend the generated compose with a `tenant-worker-acme` service on `tenant_data_plane`, `expose` an internal port, and point Edge at `http://tenant-worker-acme:8080`. Regenerate or merge carefully on upgrades.
