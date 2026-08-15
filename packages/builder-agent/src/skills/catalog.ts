import type { GenerateSkill } from '../types.js'

/** Shared stack skill — every generate job. */
export const STACK_SKILL: GenerateSkill = {
  id: 'react-app',
  title: 'Vite + React (TypeScript)',
  body: `Write a Vite + React + TypeScript app from the operator prompt. Do not clone a starter repo or import a canned UI kit.

Required files: package.json, index.html, vite.config.ts (base: './'), tsconfig.json, src/main.tsx, src/App.tsx, src/styles.css.
package.json scripts.build MUST be "vite build". Dependencies: react, react-dom. DevDependencies: vite, @vitejs/plugin-react, typescript, @types/react, @types/react-dom.
Do not use Next.js, CRA, Remix, React Native, or a gadget iframe as the live site.
POST the file tree as launchProductionApp files (same jobId if blocked). The platform runs npm install && vite build and hosts dist/.`,
}

export const WIRE_SKILL: GenerateSkill = {
  id: 'indobase-wire',
  title: 'Indobase runtime',
  body: `Bind the UI to Indobase — never invent a backend host and never name PocketBase in UI or comments.

Use window.indobase.* ABIs and window.__INDOBASE_ENV__ when present. Absolute bridge URLs are injected at publish time.
Forbidden everywhere: direct /api/collections writes for orders or leads, client-side price/stock authority, uncaught localStorage (use memory or try/catch).`,
}

export const LIVE_SKILL: GenerateSkill = {
  id: 'preview-and-live',
  title: 'Preview then LIVE',
  body: `Preview is the built dist/ at /live/{ref}/. Never tell the operator the Gadget pane is the store or site.
Call launchProductionApp. Quote a URL only when status=live and claim_live=true.
If awaiting_generate or blocked, POST the same jobId with the Vite file tree. Do not call ensure* or guidedBackend to invent a live claim.`,
}

export const LANDING_LEADS_SKILL: GenerateSkill = {
  id: 'landing-leads',
  title: 'Landing enquiry form',
  appTypes: ['landing'],
  body: `Landing pages must capture enquiries, not show a dead form.

Include an enquiry section with name, email or phone, and message. Submit via window.indobase.leads.submit({ name, email, phone, message }) or POST /api/os/leads with projectRef — never write the leads collection from the browser.
Show customer-safe success and error copy (no engine stacks). Footer year + brand is enough; avoid /privacy /terms dead links unless pages exist.
Hero: one <h1> so MODIFY can retarget the headline.`,
}

export const SAAS_AUTH_SKILL: GenerateSkill = {
  id: 'saas-auth',
  title: 'SaaS sign-in',
  appTypes: ['saas'],
  body: `SaaS apps sign in through window.indobase.auth (startOtp / verify) backed by Indobase — not a local fake session.
Two-step email → code flow. After verify, show a signed-in workspace shell (not a second marketing homepage).
Do not store auth tokens in localStorage without try/catch. Prefer the injected ABI; fall back to INDOBASE_RECORDS_BASE / OTP endpoints from __INDOBASE_ENV__.
Hero: single <h1> for MODIFY consistency.`,
}

export const ECOMMERCE_COMMERCE_SKILL: GenerateSkill = {
  id: 'ecommerce-commerce',
  title: 'Store commerce ABI',
  appTypes: ['ecommerce'],
  body: `Stores sell through window.indobase.commerce only.

- Load catalog from commerce.products.list (seeded fallback OK for empty preview).
- Cart in memory (or try/catch storage). Prices and stock come from the ABI — never hardcode checkout totals as authority.
- Checkout via commerce.checkout.create with line items (variantId + quantity). Never POST /api/collections/.../orders from the client.
- Show customer-safe errors. After success, show an order reference if returned.
Hero: single <h1>. Product cards must not be mistaken for MODIFY tag targets (avoid bare <p> generics in TypeScript).`,
}

export const ALL_GENERATE_SKILLS: GenerateSkill[] = [
  STACK_SKILL,
  WIRE_SKILL,
  LIVE_SKILL,
  LANDING_LEADS_SKILL,
  SAAS_AUTH_SKILL,
  ECOMMERCE_COMMERCE_SKILL,
]
