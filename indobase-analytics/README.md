# Indobase Analytics (AGPL-3.0 · based on Rybbit)

Privacy-friendly product analytics for Indobase projects.

- **Docs:** [`docs/INDOBASE-ANALYTICS.md`](../docs/INDOBASE-ANALYTICS.md)
- **NOTICE / upstream:** [`NOTICE.md`](./NOTICE.md), [`UPSTREAM_SHA.txt`](./UPSTREAM_SHA.txt)
- **Deploy:** [`docker/deploy/`](./docker/deploy/)

## Quick deploy

```bash
cd docker/deploy
cp .env.example .env   # secrets
docker compose --env-file .env up -d --build
```

Studio SSO: `GET /sso/launch#token=…` with `aud=indobase-analytics`.
