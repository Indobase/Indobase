import { describe, expect, it } from 'vitest'

import { validateEmailSpamHeuristics } from './validate-email-spam'

describe('validateEmailSpamHeuristics', () => {
  it('returns no rules for a typical auth template', () => {
    const result = validateEmailSpamHeuristics({
      subject: 'Reset your password',
      content: '<p>Follow this link to reset your password: {{ .ConfirmationURL }}</p>',
    })
    expect(result.rules.filter((r) => r.score > 0)).toHaveLength(0)
  })

  it('flags empty subject and body', () => {
    const result = validateEmailSpamHeuristics({ subject: '', content: '' })
    const names = result.rules.map((r) => r.name)
    expect(names).toContain('MISSING_SUBJECT')
    expect(names).toContain('EMPTY_BODY')
  })

  it('flags all-caps subjects', () => {
    const result = validateEmailSpamHeuristics({
      subject: 'URGENT ACTION REQUIRED NOW',
      content: 'Hello',
    })
    expect(result.rules.some((r) => r.name === 'SUBJ_ALL_CAPS')).toBe(true)
  })
})
