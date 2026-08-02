export const CRM_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B8FD6]/40 focus-visible:ring-offset-1'

export type CrmModule =
  | 'home'
  | 'leads'
  | 'contacts'
  | 'accounts'
  | 'deals'
  | 'activities'
  | 'reports'
  | 'automations'

export type CrmSelection =
  | { module: 'lead'; id: string }
  | { module: 'contact'; id: string }
  | { module: 'company'; id: string }
  | { module: 'deal'; id: string }
  | null
