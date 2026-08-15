import { describe, expect, it } from 'vitest'

import {
  blueprintForAppType,
  composeGenerateSkillsHint,
  listSkillIds,
  skillsForAppType,
} from './index.js'

describe('@indobase/builder-agent skills', () => {
  it('landing skills require a live enquiry form', () => {
    const ids = listSkillIds('landing')
    expect(ids).toContain('landing-leads')
    expect(ids).not.toContain('ecommerce-commerce')
    const hint = composeGenerateSkillsHint('landing')
    expect(hint).toMatch(/indobase\.leads/)
    expect(hint).toMatch(/Dead enquiry form/)
  })

  it('saas skills require OTP via indobase.auth', () => {
    const bp = blueprintForAppType('saas')
    expect(bp.skills.some((s) => s.id === 'saas-auth')).toBe(true)
    expect(bp.mustProduce.join(' ')).toMatch(/OTP/)
    expect(composeGenerateSkillsHint('saas')).toMatch(/indobase\.auth/)
  })

  it('ecommerce skills forbid client order authority', () => {
    const bp = blueprintForAppType('ecommerce')
    expect(bp.skills.some((s) => s.id === 'ecommerce-commerce')).toBe(true)
    expect(bp.forbidden.join(' ')).toMatch(/price|stock|order/i)
    expect(composeGenerateSkillsHint('ecommerce')).toMatch(/indobase\.commerce/)
  })

  it('every app type gets the shared stack + wire + live skills', () => {
    for (const type of ['landing', 'saas', 'ecommerce'] as const) {
      const ids = skillsForAppType(type).map((s) => s.id)
      expect(ids).toEqual(expect.arrayContaining(['react-app', 'indobase-wire', 'preview-and-live']))
    }
  })
})
