import { describe, expect, it } from 'vitest'

import { resolveForcedBlankSelection } from './selectStarterTemplate'

describe('resolveForcedBlankSelection', () => {
  it('forces blank for Zoho-like CRM (never Shop)', () => {
    const result = resolveForcedBlankSelection('Build a Zoho-like CRM with Indobase backend')
    expect(result?.template).toBe('blank')
    expect(result?.title.toLowerCase()).toContain('crm')
  })

  it('forces blank for sales pipeline / leads', () => {
    expect(resolveForcedBlankSelection('sales pipeline with leads and deals')?.template).toBe('blank')
  })

  it('does not force blank for explicit shop/ecommerce', () => {
    expect(resolveForcedBlankSelection('Build an ecommerce shop with cart and checkout')).toBeNull()
  })

  it('does not force blank for CRM+shop hybrid phrasing that asks for a store', () => {
    expect(resolveForcedBlankSelection('CRM with an online store and cart')).toBeNull()
  })

  it('leaves unrelated products to the LLM', () => {
    expect(resolveForcedBlankSelection('Build a todo app with auth')).toBeNull()
  })
})
