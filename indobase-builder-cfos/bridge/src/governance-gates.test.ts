import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  explainGovernanceGate,
  operatorMessageForGovernanceCode,
} from './governance-gates.ts'

describe('governance-gates', () => {
  it('explains Free prompt quota with upgrade choices', () => {
    const gate = explainGovernanceGate({
      code: 'prompt_quota_exceeded',
      upgradeUrl: '/org/acme/billing',
    })
    assert.equal(gate.code, 'prompt_quota_exceeded')
    assert.match(gate.message, /Free agent limit/)
    assert.match(gate.message, /\/org\/acme\/billing/)
    assert.match(gate.message, /Indobase/)
    assert.ok(gate.choices.some((c) => /Pro/i.test(c.label)))
    assert.ok(gate.choices.some((c) => /teams/i.test(c.label)))
    assert.doesNotMatch(gate.message, /Supabase|Vercel|Naive|Naïve|Studio|PocketBase|tenant|provisioner/i)
  })

  it('explains BYOK payments without inventing hosted PSP', () => {
    const gate = explainGovernanceGate({ code: 'gateway_not_ready', settlementHint: 'india' })
    assert.match(gate.message, /BYOK|bring-your-own|own gateway/i)
    assert.match(gate.message, /Razorpay/)
    assert.match(gate.reason, /BYOK|keys/i)
    assert.ok(gate.choices.length >= 2)
    assert.doesNotMatch(gate.message, /Supabase|Vercel/)
  })

  it('explains account required', () => {
    const gate = explainGovernanceGate({ code: 'account_required' })
    assert.match(gate.message, /Indobase account/)
    assert.ok(gate.choices.some((c) => /Create account/i.test(c.label)))
    assert.doesNotMatch(gate.message, /Studio|PocketBase|backend|tenant/i)
  })

  it('explains unwired checkout in business language', () => {
    const gate = explainGovernanceGate({ code: 'wire_required' })
    assert.match(gate.message, /checkout|products/i)
    assert.doesNotMatch(gate.message, /PocketBase|guidedBackend|Studio|Gadget/i)
    assert.doesNotMatch(gate.title, /backend/i)
  })

  it('maps known codes to operator messages', () => {
    const msg = operatorMessageForGovernanceCode('gateway_not_ready')
    assert.ok(msg)
    assert.match(msg!, /connectGateway|gateway keys|BYOK/i)
    assert.equal(operatorMessageForGovernanceCode('unknown_code'), null)
  })
})
