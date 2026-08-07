import { describe, expect, it } from 'vitest'
import {
  assertNoProviderLeak,
  createCapabilityOrchestrator,
  customerLabelFor,
  enabledMessageFor,
  normalizeCapabilityId,
  toCapabilityEnsureResult,
  type CapabilityProviderAdapter,
} from './orchestrator'

describe('CapabilityOrchestrator (ADR 0006)', () => {
  it('maps customer phrases to ABI ids', () => {
    expect(normalizeCapabilityId('Add user login')).toBe('auth')
    expect(normalizeCapabilityId('Add a customer database')).toBe('businessData')
    expect(normalizeCapabilityId('login')).toBe('auth')
    expect(normalizeCapabilityId('Customer Login')).toBe('auth')
    expect(normalizeCapabilityId('customer database')).toBe('businessData')
    expect(normalizeCapabilityId('payments')).toBe('commerce')
    expect(customerLabelFor('auth')).toBe('Customer Login')
    expect(enabledMessageFor('commerce')).toBe('Payments are live')
  })

  it('returns Indobase Enable copy without provider names', async () => {
    const adapter: CapabilityProviderAdapter = {
      async ensure() {
        return { ok: true, state: 'ready', detail: 'wired via neon singapore' }
      },
    }
    const orch = createCapabilityOrchestrator(adapter)
    const result = await orch.ensure({ businessRef: 'biz_1', capability: 'login' })
    expect(result.ok).toBe(true)
    expect(result.status).toBe('enabled')
    expect(result.message).toBe('Login enabled')
    expect(result.customerLabel).toBe('Customer Login')
    expect(result.message.toLowerCase()).not.toMatch(/neon|stripe|docker/)
  })

  it('strips provider leaks from customer strings', () => {
    expect(assertNoProviderLeak('Connected to Neon')).toMatch(/went wrong/i)
    expect(assertNoProviderLeak('Login enabled')).toBe('Login enabled')
  })

  it('maps legacy ensurer payloads to Enable copy', () => {
    const r = toCapabilityEnsureResult({
      capability: 'auth',
      ok: true,
      provisionState: 'ready',
      message: 'Backend ready via postgres',
    })
    expect(r.message).toBe('Login enabled')
    expect(r.message.toLowerCase()).not.toContain('postgres')
  })

  it('reports enabling while provisioning', async () => {
    const adapter: CapabilityProviderAdapter = {
      async ensure() {
        return { ok: true, state: 'provisioning' }
      },
    }
    const orch = createCapabilityOrchestrator(adapter)
    const result = await orch.ensure({ businessRef: 'biz_1', capability: 'database' })
    expect(result.status).toBe('enabling')
    expect(result.message).toMatch(/Creating customer database/i)
  })
})
