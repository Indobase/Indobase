/**
 * Self-hosted Studio uses one default project per user (`p-<gotrue_sub>`).
 * Keep in sync with `selfHostedDefaultProjectRef` in `lib/api/self-hosted/platform.ts`.
 */
export function selfHostedDashboardPath(userId?: string | null) {
  if (!userId) return '/project/default'
  return `/project/p-${userId}`
}
