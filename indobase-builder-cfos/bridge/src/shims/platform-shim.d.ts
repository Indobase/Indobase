/**
 * Compile-time shim — bridge should prefer `@indobase/cloudflare-adapter`.
 * Runtime resolves real `@indobase/platform` from node_modules when needed.
 */
export type Command = { id: string; kind: string; payload: unknown }
