# ADR 0002: OS-first control plane (headless Platform API)

**Status:** Accepted  
**Date:** 2026-08-07  

Canonical write-up: [../INDOBASE-OS.md](../INDOBASE-OS.md).

---

## Context

Indobase was shipping two competing visions: Studio-first (orgs, projects, provision at signup) and OS-first (chat, documents, lazy backend). Dual-product UX confuses positioning and inflates infra cost (tenant stack per free signup).

---

## Decision

1. **Indobase OS** (CFOS-native shell) is the **only customer application**.
2. **Platform API** (`/api/os/v1/*`) is the OS-facing control plane — identity, workspace, runtime ensure, deploy.
3. **Studio UI** is deprecated for customers; Studio server code remains the implementation host for Platform API and `saas.*` until extracted.
4. **Signup creates OS workspace only** — no `execution.provision` until Capability Ensurer detects need (auth, database, commerce, …).
5. **Agents replace product names** in customer UX; engines stay behind Capabilities.

---

## Consequences

- Revert Studio-coupled CFOS onboard (`createProject` + provision at verify).
- Bridge calls `PLATFORM_API_URL`, not Studio product routes.
- SSO handoff kept for **existing accounts only**.
- Phase 2–4: Business Runtime, Launch Runtime, AI Workforce per [INDOBASE-OS.md](../INDOBASE-OS.md).

---

## Non-goals (Phase 1)

- Deleting Studio codebase or `saas.*` schema
- Keycloak migration (adapter interface only later)
- Customer-facing Coolify/Dokploy dashboards
