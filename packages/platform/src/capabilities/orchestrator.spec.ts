import { describe, expect, it } from 'vitest'
import {
  assertNoProviderLeak,
  createCapabilityOrchestrator,
  customerLabelFor,
  enabledMessageFor,
  normalizeCapabilityId,
  pendingMessageFor,
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
    expect(pendingMessageFor('commerce')).toMatch(/finish checkout setup/i)
    expect(pendingMessageFor('email')).toMatch(/finish sender setup/i)
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
    expect(result.setupStatus).toBe('ready')
    expect(result.message.toLowerCase()).not.toMatch(/neon|stripe|docker/)
  })

  it('maps pending_setup to enabling with finish-setup copy (not Payments are live)', async () => {
    const adapter: CapabilityProviderAdapter = {
      async ensure() {
        return {
          ok: true,
          state: 'pending_setup',
          launchUrl: 'https://payments.indobase.in/launch#token=x',
          setupStatus: 'pending',
        }
      },
    }
    const orch = createCapabilityOrchestrator(adapter)
    const result = await orch.ensure({ businessRef: 'biz_1', capability: 'payments' })
    expect(result.ok).toBe(true)
    expect(result.status).toBe('enabling')
    expect(result.provisionState).toBe('pending_setup')
    expect(result.setupStatus).toBe('pending')
    expect(result.launchUrl).toContain('payments.indobase.in')
    expect(result.message).toBe(
      'Payments backend is ready — finish checkout setup to charge customers.',
    )
    expect(result.message).not.toMatch(/Payments are live/i)
  })

  it('uses adapter customerMessage for pending_setup when provided', async () => {
    const adapter: CapabilityProviderAdapter = {
      async ensure() {
        return {
          ok: true,
          state: 'pending_setup',
          customerMessage:
            'Email backend is ready — setup could not be linked right now. Try again from Indobase OS.',
          launchUrl: null,
          setupStatus: 'pending',
        }
      },
    }
    const orch = createCapabilityOrchestrator(adapter)
    const result = await orch.ensure({ businessRef: 'biz_1', capability: 'email' })
    expect(result.status).toBe('enabling')
    expect(result.message).toMatch(/could not be linked/i)
    expect(result.message).not.toMatch(/Email enabled/i)
    expect(result.launchUrl).toBeNull()
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

  it('maps pending_setup legacy payloads to finish-setup copy', () => {
    const r = toCapabilityEnsureResult({
      capability: 'commerce',
      ok: true,
      provisionState: 'pending_setup',
    })
    expect(r.status).toBe('enabling')
    expect(r.setupStatus).toBe('pending')
    expect(r.message).toMatch(/finish checkout setup/i)
    expect(r.message).not.toMatch(/Payments are live/i)
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
