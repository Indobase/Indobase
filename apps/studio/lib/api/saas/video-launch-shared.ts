/**
 * Client-safe Video SSO helpers (no Node crypto / DB imports).
 * Server minting lives in `video-launch.ts`.
 */

/** Same org roles as Email / Social / Design / Payments. */
export const VIDEO_ALLOWED_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const
export type VideoRole = (typeof VIDEO_ALLOWED_ROLES)[number]

export const VIDEO_ROLE_DENIED_CODE = 'video_role_denied' as const

const ALLOWED_ROLE_SET = new Set<string>(VIDEO_ALLOWED_ROLES)

export function isVideoRole(role: string | null | undefined): role is VideoRole {
  return !!role && ALLOWED_ROLE_SET.has(role)
}

export function isVideoRoleDeniedMessage(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes(VIDEO_ROLE_DENIED_CODE) ||
    (lower.includes('video') && lower.includes('ask an organization'))
  )
}
