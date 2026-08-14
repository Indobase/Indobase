/**
 * Generate contract for agents: blueprint (definition of done) + skills (how to build).
 * Not a UI starter template — the model invents the React UI against this spec.
 */

import type { ProductionAppType } from './application-planner.js'
import { resolveProductionContract, type ProductionApplicationContract } from './production-contract.js'

export const GENERATE_SKILL_ID = 'generate-react-vite/v1' as const

export type GenerateSkill = {
  id: string
  title: string
  body: string
}

export type ApplicationBlueprint = {
  appType: ProductionAppType
  version: string
  stack: 'vite-react-ts'
  contract: ProductionApplicationContract
  mustProduce: string[]
  forbidden: string[]
  skills: GenerateSkill[]
}

export const STACK_SKILL: GenerateSkill = {
  id: 'react-app',
  title: 'Vite + React (TypeScript)',
  body: `Write a Vite + React + TypeScript app from the operator prompt. Do not clone a starter repo or import a canned UI kit.

Required files: package.json, index.html, vite.config.ts (base: './'), src/main.tsx, src/App.tsx.
package.json scripts.build MUST be "vite build". Dependencies: react, react-dom, vite, @vitejs/plugin-react, typescript.
Do not use Next.js, CRA, Remix, or a gadget iframe as the live site.
POST the file tree as launchProductionApp files (same jobId if blocked). The platform runs npm install && vite build and hosts dist/.`,
}

export const WIRE_SKILL: GenerateSkill = {
  id: 'indobase-wire',
  title: 'Indobase runtime',
  body: `Bind the UI to Indobase — never invent a backend host.

Landing: public pages only; Privacy + Terms links.
SaaS: OTP + records via window.__INDOBASE_ENV__ / fetch to INDOBASE_RECORDS_BASE. No localStorage auth.
Store: window.indobase.commerce only (products, cart, checkout). Forbidden: PocketBase /api/collections/.../orders POST, client-side prices/stock.
Cart may use memory or try/catch sessionStorage — never uncaught localStorage.`,
}

export const LIVE_SKILL: GenerateSkill = {
  id: 'preview-and-live',
  title: 'Preview then LIVE',
  body: `Preview is the built dist/ at /live/{ref}/. Never tell the operator the Gadget pane is the store.
Call launchProductionApp. Quote a URL only when status=live and claim_live=true.
If awaiting_generate or blocked, POST the same jobId with the Vite file tree. Do not call ensure* or guidedBackend.`,
}

export function blueprintForAppType(appType: ProductionAppType): ApplicationBlueprint {
  const contract = resolveProductionContract(appType)
  const mustProduce =
    appType === 'ecommerce'
      ? ['catalog UI', 'cart', 'checkout via commerce ABI', 'vite buildable tree']
      : appType === 'saas'
        ? ['OTP sign-in', 'signed-in CRUD against records', 'vite buildable tree']
        : ['public homepage', 'title + meta', 'privacy/terms', 'vite buildable tree']
  const forbidden = [
    'Next.js / Vercel / Netlify',
    'Gadget iframe as the live URL',
    'Invented third-party hosts',
  ]
  if (appType === 'ecommerce') {
    forbidden.push('Client-authored order POST or prices')
  }
  return {
    appType,
    version: `${appType}-blueprint/v1`,
    stack: 'vite-react-ts',
    contract,
    mustProduce,
    forbidden,
    skills: [STACK_SKILL, WIRE_SKILL, LIVE_SKILL],
  }
}

export function composeGenerateSkillsHint(appType?: ProductionAppType | null): string {
  const type = appType || 'landing'
  const bp = blueprintForAppType(type)
  return `## GENERATE (HARD — blueprint + skills, not a starter template)
App type: ${bp.appType}. Stack: ${bp.stack}.
Must produce: ${bp.mustProduce.join('; ')}.
Forbidden: ${bp.forbidden.join('; ')}.
${bp.skills.map((s) => `### ${s.title}\n${s.body}`).join('\n\n')}`
}
