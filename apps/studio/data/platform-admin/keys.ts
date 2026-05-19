export const platformAdminKeys = {
  operator: ['platform-admin', 'operator'] as const,
  overview: ['platform-admin', 'overview'] as const,
  organizations: (search: string, limit: number, offset: number) =>
    ['platform-admin', 'organizations', { search, limit, offset }] as const,
  projects: (search: string, limit: number, offset: number) =>
    ['platform-admin', 'projects', { search, limit, offset }] as const,
  users: (search: string, limit: number, offset: number) =>
    ['platform-admin', 'users', { search, limit, offset }] as const,
  auditLogs: (limit: number, offset: number) =>
    ['platform-admin', 'audit-logs', { limit, offset }] as const,
  usage: (days: number) => ['platform-admin', 'usage', { days }] as const,
}
