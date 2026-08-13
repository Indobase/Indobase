/**
 * Platform primitive catalog — production launch is a job, not an optional agent tool.
 */

export const LAUNCH_PRODUCTION_APP_TOOL = {
  name: 'launchProductionApp',
  aliases: ['launchApp', 'productionLaunch'] as const,
  description:
    'Enqueue the Indobase Production Launch Job (POST /api/os/apps/launch). ' +
    'The job owns classify → provision → generate → wire → verify → deploy → smoke. ' +
    'Do not assemble production yourself. Call this tool for Launch / Go Live.',
  method: 'POST' as const,
  path: '/api/os/apps/launch',
  parameters: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'What the operator asked to launch' },
      appType: { type: 'string', description: 'landing | saas | ecommerce (optional; planner infers)' },
      production: { type: 'boolean', description: 'Always true for this job' },
      html: { type: 'string', description: 'Optional production HTML; job generates a shell if omitted' },
      files: { type: 'object' },
      jobId: { type: 'string', description: 'Resume a paused / blocked job' },
      brand: { type: 'string' },
      title: { type: 'string' },
      vertical: { type: 'string' },
    },
  },
} as const

export const LAUNCH_PRODUCTION_APP_AGENT_HARD_RULES = `
## Production Launch Job (HARD — platform owns the stages)

Do **not** assemble production yourself. Call **launchProductionApp** for Launch / Go Live.

1. For any production outcome (Launch a SaaS / Store / Landing, Go Live, take live): call **launchProductionApp** → POST /api/os/apps/launch.
2. The job runs classify → contract → provision → generate → wire → verify → deploy → smoke → LIVE.
3. Quote job.jobId + stages. ONLY claim a live URL when the job returns status=live and claim_live=true.
4. If status=awaiting_generate: POST the same jobId with html/files.
5. If status=blocked: say what the customer cannot do yet and retry the same jobId (max 3). Never invent a URL.
6. Draft/preview (production:false) may still use launchBusiness. Production Go Live is this job.
7. The job provisions catalog and commerce when the operator asked for a store. Do not pick other tools.
8. claim_production_ready comes from job evidence after LIVE — never invent it.
`.trim()

export function launchProductionAppToolCatalog() {
  return {
    name: LAUNCH_PRODUCTION_APP_TOOL.name,
    aliases: [...LAUNCH_PRODUCTION_APP_TOOL.aliases],
    description: LAUNCH_PRODUCTION_APP_TOOL.description,
    method: LAUNCH_PRODUCTION_APP_TOOL.method,
    path: LAUNCH_PRODUCTION_APP_TOOL.path,
    status: '/api/os/apps/launch/:jobId',
    parameters: LAUNCH_PRODUCTION_APP_TOOL.parameters,
    rules: LAUNCH_PRODUCTION_APP_AGENT_HARD_RULES,
  }
}
