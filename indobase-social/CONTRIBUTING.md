# Contributing to Indobase Social

Thanks for your interest in contributing to Indobase Social.

This tree lives inside the Indobase monorepo:
`https://github.com/Indobase/Indobase/tree/main/indobase-social`

## Before you start

- Read `CLAUDE.md` for monorepo layout (pnpm, NestJS backend, frontend, Temporal orchestrator).
- Prefer Indobase branding in any user-visible strings (`productNameServerSide()`).
- Keep `@gitroom/*` internal package import paths; do not rename those packages casually.
- Preserve `LICENSE` and `NOTICE.md` (AGPL attribution to upstream Postiz).

## How to contribute

1. Open an issue or discuss the change with the Indobase team.
2. Follow the PR template in `.github/PULL_REQUEST_TEMPLATE.md`.
3. Use pnpm only; run lint/tests from the `indobase-social` root when possible.

## Security

Report vulnerabilities privately via GitHub Security Advisories on the Indobase repository — see `SECURITY.md`.
