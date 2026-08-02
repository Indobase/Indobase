export const crmKeys = {
  setup: (projectRef: string | undefined) => ['projects', projectRef, 'crm', 'setup'] as const,
  stages: (projectRef: string | undefined) => ['projects', projectRef, 'crm', 'stages'] as const,
  companies: (projectRef: string | undefined) =>
    ['projects', projectRef, 'crm', 'companies'] as const,
  contacts: (projectRef: string | undefined) =>
    ['projects', projectRef, 'crm', 'contacts'] as const,
  deals: (projectRef: string | undefined) => ['projects', projectRef, 'crm', 'deals'] as const,
  leads: (projectRef: string | undefined) => ['projects', projectRef, 'crm', 'leads'] as const,
  activities: (projectRef: string | undefined) =>
    ['projects', projectRef, 'crm', 'activities'] as const,
  notes: (
    projectRef: string | undefined,
    module: string | undefined,
    relatedId: string | undefined
  ) => ['projects', projectRef, 'crm', 'notes', module, relatedId] as const,
  tags: (projectRef: string | undefined) => ['projects', projectRef, 'crm', 'tags'] as const,
  recordTags: (
    projectRef: string | undefined,
    module: string | undefined,
    relatedId: string | undefined
  ) => ['projects', projectRef, 'crm', 'record-tags', module, relatedId] as const,
  automations: (projectRef: string | undefined) =>
    ['projects', projectRef, 'crm', 'automations'] as const,
  pipelineReport: (projectRef: string | undefined) =>
    ['projects', projectRef, 'crm', 'pipeline-report'] as const,
  createCompany: () => ['crm', 'create-company'] as const,
  createContact: () => ['crm', 'create-contact'] as const,
  createDeal: () => ['crm', 'create-deal'] as const,
  updateDealStage: () => ['crm', 'update-deal-stage'] as const,
  createLead: () => ['crm', 'create-lead'] as const,
  updateLead: () => ['crm', 'update-lead'] as const,
  convertLead: () => ['crm', 'convert-lead'] as const,
  createActivity: () => ['crm', 'create-activity'] as const,
  updateActivity: () => ['crm', 'update-activity'] as const,
  createNote: () => ['crm', 'create-note'] as const,
}
