/** MCP session lifetime — must match cookie Max-Age on /launch and /api/indobase/session. */
export const BUILDER_MCP_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export const BUILDER_MCP_COOKIE = 'indobase_builder_mcp';

export const BUILDER_LAST_PROJECT_REF_KEY = 'indobase_builder_last_project_ref';

/** Re-validate MCP session on this interval while Builder is open. */
export const BUILDER_SESSION_KEEPALIVE_MS = 15 * 60 * 1000;

/** Refresh via Studio popup when token expires within this window. */
export const BUILDER_SESSION_REFRESH_LEAD_MS = 24 * 60 * 60 * 1000;
