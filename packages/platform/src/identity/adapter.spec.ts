import { describe, expect, it } from 'vitest'
import {
  assertIdentityAdapter,
  type IdentityAdapter,
  type IdentitySession,
} from './adapter'

describe('IdentityAdapter', () => {
  it('is the type OS OTP uses — PocketBase is an impl, not the session API', async () => {
    const session: IdentitySession = {
      identity: { id: 'usr_1', email: 'op@indobase.in', displayName: 'Op' },
      business: { ref: 'biz_1', name: 'UrbanThread' },
      workspace: { ref: 'biz_1', slug: 'indobase', name: 'UrbanThread' },
      provisionState: 'ready',
      dataPlane: { url: 'https://data.example', anonKey: 'public' },
    }
    const adapter: IdentityAdapter = {
      async startOtp(input) {
        return { ok: true, email: input.email }
      },
      async verifyOtp() {
        return { ok: true, session }
      },
    }
    const bound = assertIdentityAdapter(adapter)
    const start = await bound.startOtp({ name: 'Op', email: 'op@indobase.in' })
    expect(start.ok).toBe(true)
    if (start.ok) expect(start.email).toBe('op@indobase.in')
    const verify = await bound.verifyOtp({
      name: 'Op',
      email: 'op@indobase.in',
      token: '123456',
    })
    expect(verify.ok).toBe(true)
    if (verify.ok) {
      expect(verify.session.identity.email).toBe('op@indobase.in')
      expect(verify.session.business.ref).toBe('biz_1')
      expect(JSON.stringify(verify.session)).not.toMatch(/PocketBase|GoTrue|Studio/i)
    }
  })
})
