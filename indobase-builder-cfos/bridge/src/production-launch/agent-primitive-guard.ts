/**
 * Physical five-tool boundary.
 *
 * Agent-facing tools stay on the CFOS catalog. Platform primitives stay
 * callable in-process by the conductor / production job. HTTP + AgentTool
 * invocations of primitives are rejected.
 */
import type { Context } from 'hono'

import {
  AGENT_FACING_TOOL_NAMES,
  PLATFORM_PRIMITIVE_TOOL_NAMES,
} from './agent-surface.js'

export const AGENT_PRIMITIVE_REJECTED_CODE = 'not_an_agent_tool' as const

export const AGENT_PRIMITIVE_REJECTED_MESSAGE =
  'That setup is handled automatically. Tell me what you want for the business — I will take the next step.'

export function agentPrimitiveRejectedBody() {
  return {
    ok: false as const,
    code: AGENT_PRIMITIVE_REJECTED_CODE,
    message: AGENT_PRIMITIVE_REJECTED_MESSAGE,
  }
}

/** HTTP paths the five public tools may use. Everything else under /api/os/tools is 403. */
export const PUBLIC_AGENT_TOOL_PATHS = [
  '/api/os/tools/launchProductionApp',
  '/api/os/tools/launchBusiness',
  '/api/os/tools/goLive',
  '/api/os/tools/connectGateway',
  '/api/os/tools/connectPaymentGateway',
  '/api/os/tools/productionChecklist',
  '/api/os/tools/promptQuota',
] as const

/** Browser UX helpers under /api/os/tools — not agent-facing, not primitives. */
export const PLATFORM_UI_TOOL_PATHS = ['/api/os/tools/followups'] as const

const PUBLIC_PATH_SET = new Set<string>(PUBLIC_AGENT_TOOL_PATHS)
const UI_PATH_SET = new Set<string>(PLATFORM_UI_TOOL_PATHS)

/** HTTP paths the agent must not be able to invoke. */
export const PLATFORM_PRIMITIVE_TOOL_PATHS = [
  '/api/os/tools/guidedBackend',
  '/api/os/tools/runGuidedBackend',
  '/api/os/tools/ensureLogin',
  '/api/os/tools/enableLogin',
  '/api/os/tools/ensureDatabase',
  '/api/os/tools/ensureBusinessData',
  '/api/os/tools/ensureEmail',
  '/api/os/tools/enableEmail',
  '/api/os/tools/ensureAnalytics',
  '/api/os/tools/ensureEvents',
  '/api/os/tools/enableAnalytics',
  '/api/os/tools/applySchema',
  '/api/os/tools/setupShopCatalog',
  '/api/os/tools/seedShopCatalog',
  '/api/os/tools/listShopOrders',
  '/api/os/tools/listShopCatalog',
  '/api/os/tools/placeTestShopOrder',
  '/api/os/tools/testShopCheckout',
  '/api/os/tools/resolveProductImages',
  '/api/os/tools/findProductImages',
  '/api/os/tools/wireCheckout',
  '/api/os/tools/wirePricing',
] as const

const PRIMITIVE_PATH_SET = new Set<string>(PLATFORM_PRIMITIVE_TOOL_PATHS)

export function isPublicAgentToolPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] || pathname).replace(/\/+$/, '') || '/'
  return PUBLIC_PATH_SET.has(path)
}

export function isPlatformUiToolPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] || pathname).replace(/\/+$/, '') || '/'
  return UI_PATH_SET.has(path)
}

export function isPlatformPrimitiveToolPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] || pathname).replace(/\/+$/, '') || '/'
  if (isPublicAgentToolPath(path)) return false
  if (isPlatformUiToolPath(path)) return false
  if (path.startsWith('/api/os/tools/')) return true
  return PRIMITIVE_PATH_SET.has(path)
}

export function isAgentFacingToolName(name: string): boolean {
  return (AGENT_FACING_TOOL_NAMES as readonly string[]).includes(name)
}

export function isPlatformPrimitiveToolName(name: string): boolean {
  return (PLATFORM_PRIMITIVE_TOOL_NAMES as readonly string[]).includes(name)
}

/** CFOS AgentTool requests always send this header. Cookie-only CC/job calls do not. */
export function isAgentToolInvocation(c: Context): boolean {
  const username = (
    c.req.header('x-indobase-agent-username') ||
    c.req.header('X-Indobase-Agent-Username') ||
    ''
  ).trim()
  return Boolean(username)
}

export function rejectAgentPrimitiveIfNeeded(c: Context): Response | null {
  const path = new URL(c.req.url).pathname
  if (!path.startsWith('/api/os/tools/')) return null
  if (isPublicAgentToolPath(path)) return null
  if (isPlatformUiToolPath(path)) return null
  return c.json(agentPrimitiveRejectedBody(), 403)
}
