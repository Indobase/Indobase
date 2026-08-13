/**
 * productionChecklist — claim gate before saying any web app is production ready.
 * Ecommerce/SaaS/landing jobs: claim is derived from launch job evidence, not agent booleans.
 */

import { platformProductionChecklist } from './platform-api-client.js'
import { deriveProductionChecklist, getLatestProductionLaunchJob } from './production-launch/index.js'

export const PRODUCTION_CHECKLIST_TOOL = {
  name: 'productionChecklist',
  aliases: ['claimProductionReady', 'production_checklist'] as const,
  description:
    'Evaluate whether this web app is production ready. For production jobs, claim_production_ready is derived from launch evidence — do not invent checks. ' +
    'ONLY claim “production ready” when claim_production_ready is true. Do not use webFetch.',
  method: 'POST' as const,
  path: '/api/os/tools/productionChecklist',
  wraps: '/api/os/production/checklist',
  parameters: {
    type: 'object',
    required: ['app_type', 'live_url', 'checks'],
    properties: {
      app_type: {
        type: 'string',
        description: 'landing | saas | ecommerce | booking | blog | dashboard | other',
      },
      live_url: { type: 'string', description: 'Exact launchBusiness url' },
      brand: { type: 'string' },
      checks: {
        type: 'object',
        description:
          'Booleans: live_url, login_wired, schema_applied, checkout_wired, seo_basics, legal_links, custom_domain',
      },
    },
  },
} as const

export const PRODUCTION_CHECKLIST_AGENT_HARD_RULES = `
## Production ready (HARD PATH — any web application)

You build full web apps on Indobase (landing, SaaS, ecommerce, booking, blog, dashboard — not shops only).

Before you say “production ready” / “shipped” / “ready for customers”:

1. Call **productionChecklist** after a production job. The tool reads job evidence.
2. ONLY claim production ready when the tool returns claim_production_ready:true.
3. If false: quote missing evidence / retry the same launchProductionApp jobId. Do not invent checks.
4. Stay on Indobase hosting. Never Vercel/Netlify/Firebase as the production host.
`.trim()

export function productionChecklistToolCatalog() {
  return {
    name: PRODUCTION_CHECKLIST_TOOL.name,
    aliases: [...PRODUCTION_CHECKLIST_TOOL.aliases],
    description: PRODUCTION_CHECKLIST_TOOL.description,
    method: PRODUCTION_CHECKLIST_TOOL.method,
    path: PRODUCTION_CHECKLIST_TOOL.path,
    wraps: PRODUCTION_CHECKLIST_TOOL.wraps,
    parameters: PRODUCTION_CHECKLIST_TOOL.parameters,
    rules: PRODUCTION_CHECKLIST_AGENT_HARD_RULES,
  }
}

export async function executeProductionChecklist(
  session: { gotrueId: string; email: string; projectRef: string },
  input: {
    app_type?: string | null
    live_url?: string | null
    brand?: string | null
    checks?: Record<string, unknown> | null
  },
) {
  const job = getLatestProductionLaunchJob(session.projectRef)
  if (job) {
    const derived = deriveProductionChecklist(job)
    return {
      ok: true,
      tool: 'productionChecklist' as const,
      claim_production_ready: derived.claim_production_ready,
      source: derived.source,
      jobId: derived.jobId,
      app_type: derived.appType,
      live_url: derived.live_url,
      evidence: derived.evidence,
      message: derived.claim_production_ready
        ? 'Production ready — derived from launch job evidence'
        : 'Not production ready — launch job evidence is incomplete',
    }
  }
  const result = await platformProductionChecklist({
    gotrueId: session.gotrueId,
    email: session.email,
    workspaceRef: session.projectRef,
    appType: input.app_type,
    liveUrl: input.live_url,
    brand: input.brand,
    checks: input.checks,
  })
  return {
    ...result,
    tool: 'productionChecklist' as const,
    claim_production_ready: result.claim_production_ready === true,
    source: 'legacy_checks',
  }
}
