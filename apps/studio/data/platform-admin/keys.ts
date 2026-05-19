export const platformAdminKeys = {
  operator: ['platform-admin', 'operator'] as const,
  overview: ['platform-admin', 'overview'] as const,
  organizations: (search: string, limit: number, offset: number) =>
    ['platform-admin', 'organizations', { search, limit, offset }] as const,
  organization: (slug: string) => ['platform-admin', 'organization', slug] as const,
  projects: (search: string, limit: number, offset: number) =>
    ['platform-admin', 'projects', { search, limit, offset }] as const,
  users: (search: string, limit: number, offset: number) =>
    ['platform-admin', 'users', { search, limit, offset }] as const,
  auditLogs: (limit: number, offset: number, filterKey: string) =>
    ['platform-admin', 'audit-logs', { limit, offset, filterKey }] as const,
  usage: (days: number) => ['platform-admin', 'usage', { days }] as const,
  problems: (limit: number) => ['platform-admin', 'problems', { limit }] as const,
}
