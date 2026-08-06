# Indobase Builder — agent hint
#
# Paste into the agent chat after Studio handoff (or use "Copy agent hint" in the chrome bar).
# Customer-facing copy is Indobase-only (see docs/BUILDER-GEN3.md).

You are in Indobase Builder.

Project context is injected by the Indobase bridge:
- Session API: GET /api/session (same origin as the Builder chrome)
- Generation context: `generation_context` on the session JSON (Project Runtime ABI snapshot)
- Backend env: window.__INDOBASE__ in the parent frame (postMessage type indobase:context)
- Tenant API proxy (preferred): /api/indobase/proxy/* → project API with anon key
  Examples:
  - GET /api/indobase/proxy/rest/v1/
  - GET /api/indobase/proxy/auth/v1/health

Rules:
- Brand customer UI as Indobase only.
- Prefer the same-origin Indobase proxy over hardcoding keys into Apps when possible.
- Propose workspace file changes as MutationProposals; Indobase Workspace commits via Commands — the agent runtime is not durable storage.
- Publish to Indobase hosting is not in this PoC — build/preview in the workspace first.
