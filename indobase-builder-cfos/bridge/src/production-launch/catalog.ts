/**
 * Platform primitive catalog — production launch is a job, not an optional agent tool.
 */

export const LAUNCH_PRODUCTION_APP_TOOL = {
  name: 'launchProductionApp',
  aliases: ['launchApp', 'productionLaunch'] as const,
  description:
    'Enqueue the Indobase Production Launch Job (POST /api/os/apps/launch). ' +
    'The job owns classify → provision → generate → wire → verify → deploy → smoke. ' +
    'GENERATE invents Vite+React from session.launch.generate blueprint+skills (not a cloned starter). ' +
    'Vague first asks still need niche/app-type CHOICES before this tool — do not skip cards or invent a brand. ' +
    'Named brand+vertical → BUILD/GENERATE. Call this tool for Launch / Go Live after preview, or to resume awaiting_generate / react_build_failed with the same jobId + file tree.',
  method: 'POST' as const,
  path: '/api/os/apps/launch',
  parameters: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'What the operator asked to launch' },
      appType: { type: 'string', description: 'landing | saas | ecommerce (optional; planner infers)' },
      production: { type: 'boolean', description: 'Always true for this job' },
      html: { type: 'string', description: 'Optional; prefer files as a Vite+React tree. Job compiles with vite build.' },
      files: {
        type: 'object',
        description:
          'Vite + React + TS file tree (package.json, index.html, vite.config.ts, src/*). Not a cloned starter. Platform runs vite build.',
      },
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

1. After niche/app-type is known (or named brand+vertical): BUILD/GENERATE then call **launchProductionApp** for Go Live / take live. Vague first asks → CHOICES first, then this tool.
2. The job runs classify → contract → provision → generate → wire → verify → deploy → smoke → LIVE.
3. Quote job.jobId + stages. ONLY claim a live URL when the job returns status=live and claim_live=true.
4. If status=awaiting_generate or react_build_failed: POST the same jobId with a Vite+React file tree (blueprint + skills — do not clone a starter).
5. If status=blocked: say what the customer cannot do yet and retry the same jobId (max 3). Never invent a URL.
6. launchBusiness without production:false runs this same job. production:false is draft preview only.
7. The job provisions catalog and commerce when the operator asked for a store. Do not pick other tools.
8. claim_production_ready comes from job evidence after LIVE — never invent it. Claim live only from BusinessRuntimeState.
9. GENERATE: invent UI from session.launch.generate blueprint+skills (Vite+React+TS). Platform compiles dist/. Vague asks: CHOICES first — do not invent a brand to skip cards. Do not use a gadget iframe as the live site.
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
