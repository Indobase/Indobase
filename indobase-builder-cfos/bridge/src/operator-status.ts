/**
 * Customer-visible progress verbs. Never "Working".
 */
export const OPERATOR_STATUS = {
  creating: 'Creating',
  updating: 'Updating',
  launching: 'Launching',
  checking: 'Checking',
  ready: 'Ready',
  failed: 'Failed',
} as const

export type OperatorStatus = (typeof OPERATOR_STATUS)[keyof typeof OPERATOR_STATUS]

const TOOL_STATUS: Record<string, OperatorStatus> = {
  launchProductionApp: OPERATOR_STATUS.launching,
  launchBusiness: OPERATOR_STATUS.creating,
  connectGateway: OPERATOR_STATUS.updating,
  productionChecklist: OPERATOR_STATUS.checking,
  promptQuota: OPERATOR_STATUS.checking,
  authStart: OPERATOR_STATUS.checking,
  authVerify: OPERATOR_STATUS.checking,
  sessionStatus: OPERATOR_STATUS.checking,
}

const HIDDEN_PRIMITIVES = new Set([
  'ensureDatabase',
  'ensureLogin',
  'ensureEmail',
  'ensureAnalytics',
  'guidedBackend',
  'applySchema',
  'setupShopCatalog',
  'resolveProductImages',
  'placeTestShopOrder',
  'listShopOrders',
  'wireCheckout',
  'createGadget',
])

/** Verb for a tool-call row. Hidden primitives stay Creating (never Working). */
export function operatorStatusForTool(name: string): OperatorStatus {
  const key = (name || '').trim()
  if (TOOL_STATUS[key]) return TOOL_STATUS[key]
  if (HIDDEN_PRIMITIVES.has(key)) return OPERATOR_STATUS.creating
  return OPERATOR_STATUS.creating
}

export function isForbiddenOperatorStatus(value: string): boolean {
  return /\bworking\b/i.test(value || '')
}
