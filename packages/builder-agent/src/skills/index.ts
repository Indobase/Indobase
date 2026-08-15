import type { ApplicationBlueprint, BuilderAppType, GenerateSkill } from '../types.js'
import {
  ALL_GENERATE_SKILLS,
  ECOMMERCE_COMMERCE_SKILL,
  LANDING_LEADS_SKILL,
  LIVE_SKILL,
  SAAS_AUTH_SKILL,
  STACK_SKILL,
  WIRE_SKILL,
} from './catalog.js'

export {
  ALL_GENERATE_SKILLS,
  ECOMMERCE_COMMERCE_SKILL,
  LANDING_LEADS_SKILL,
  LIVE_SKILL,
  SAAS_AUTH_SKILL,
  STACK_SKILL,
  WIRE_SKILL,
}

export function skillsForAppType(appType: BuilderAppType): GenerateSkill[] {
  return ALL_GENERATE_SKILLS.filter(
    (skill) => !skill.appTypes?.length || skill.appTypes.includes(appType),
  )
}

export function blueprintForAppType(appType: BuilderAppType): ApplicationBlueprint {
  const mustProduce =
    appType === 'ecommerce'
      ? [
          'catalog UI',
          'cart',
          'checkout via window.indobase.commerce',
          'vite buildable tree',
        ]
      : appType === 'saas'
        ? [
            'OTP sign-in via window.indobase.auth',
            'signed-in workspace shell',
            'vite buildable tree',
          ]
        : [
            'public homepage',
            'enquiry form via window.indobase.leads',
            'single hero <h1>',
            'vite buildable tree',
          ]

  const forbidden = [
    'Next.js / Vercel / Netlify',
    'React Native',
    'Gadget iframe as the live URL',
    'Invented third-party hosts',
    'PocketBase named in customer UI',
  ]
  if (appType === 'ecommerce') {
    forbidden.push('Client-authored order POST or client price/stock authority')
  }
  if (appType === 'landing') {
    forbidden.push('Dead enquiry form with no leads ABI')
  }
  if (appType === 'saas') {
    forbidden.push('localStorage-only auth without Indobase OTP')
  }

  return {
    appType,
    version: `${appType}-blueprint/v1`,
    stack: 'vite-react-ts',
    mustProduce,
    forbidden,
    skills: skillsForAppType(appType),
  }
}

export function composeGenerateSkillsHint(appType?: BuilderAppType | null): string {
  const type = appType || 'landing'
  const bp = blueprintForAppType(type)
  return `## GENERATE (HARD — blueprint + skills, not a starter template)
App type: ${bp.appType}. Stack: ${bp.stack}.
Must produce: ${bp.mustProduce.join('; ')}.
Forbidden: ${bp.forbidden.join('; ')}.
${bp.skills.map((s) => `### ${s.title}\n${s.body}`).join('\n\n')}`
}

export function listSkillIds(appType?: BuilderAppType | null): string[] {
  return skillsForAppType(appType || 'landing').map((s) => s.id)
}
