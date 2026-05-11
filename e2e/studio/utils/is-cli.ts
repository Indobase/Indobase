import { env } from '../env.config.js'

/**
 * Returns true when Studio targets the local Indobase SaaS stack (`IS_PLATFORM=false`),
 * including CLI-driven E2E runs. False when tests target hosted Supabase Platform API.
 */
export function isCLI(): boolean {
  // IS_PLATFORM=true = hosted Supabase Platform API
  // IS_PLATFORM=false = Indobase SaaS / local Studio
  return !env.IS_PLATFORM
}
