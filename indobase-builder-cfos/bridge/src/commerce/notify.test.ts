import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { clearBusinessSpecsForTests, inferBusinessSpec, rememberBusinessSpec } from '../ux/business-spec.ts'
import { workspaceOrdersInboxUrl } from '../ux/presentation.ts'
import { composeOrderNotifyMessage, notifyOwnerOfOrder } from './notify.ts'

describe('store order notify', () => {
  it('emails the owner a plain order summary with an Orders deep link', async () => {
    clearBusinessSpecsForTests()
    rememberBusinessSpec(
      'projorder1',
      inferBusinessSpec('Launch an online grocery store called Harbor Grocer'),
    )
    const sent: Array<{ to: string; subject: string; text: string }> = []
    const result = await notifyOwnerOfOrder({
      projectRef: 'projorder1',
      orderId: 'ord_abc123xyz',
      customerName: 'Asha Menon',
      customerEmail: 'asha@example.com',
      amountMinor: 45900,
      currency: 'INR',
      lines: [
        { name: 'Basmati rice 5kg', quantity: 1 },
        { name: 'Toor dal 1kg', quantity: 2 },
      ],
      lookupOwner: async () => ({ email: 'owner@indobase.in' }),
      send: async (message) => {
        sent.push(message)
        return true
      },
    })
    assert.equal(result.sent, true)
    assert.equal(sent[0]?.to, 'owner@indobase.in')
    assert.match(sent[0]?.subject || '', /Harbor Grocer|Your store/)
    assert.match(sent[0]?.text || '', /Asha Menon/)
    assert.match(sent[0]?.text || '', /asha@example.com/)
    assert.match(sent[0]?.text || '', /Basmati rice/)
    assert.match(sent[0]?.text || '', /Open orders/)
    assert.match(sent[0]?.text || '', /[?&]screen=orders/)
    assert.doesNotMatch(sent[0]?.text || '', /PocketBase|projectRef|admin|ord_abc/i)
  })

  it('skips quietly when there is no owner to notify', async () => {
    const result = await notifyOwnerOfOrder({
      projectRef: 'projorder2',
      orderId: 'ord_1',
      customerEmail: 'a@b.co',
      amountMinor: 100,
      currency: 'INR',
      lines: [{ name: 'Item', quantity: 1 }],
      lookupOwner: async () => null,
      send: async () => true,
    })
    assert.equal(result.sent, false)
    if (!result.sent) assert.equal(result.reason, 'no_owner')
  })

  it('keeps the order email short and deep-links to Orders', () => {
    const message = composeOrderNotifyMessage({
      brand: 'Harbor Grocer',
      orderId: 'ord_longref12345',
      customerEmail: 'a@b.co',
      amountMinor: 19900,
      currency: 'INR',
      lines: Array.from({ length: 12 }, (_, i) => ({ name: `Item ${i + 1}`, quantity: 1 })),
      inboxUrl: workspaceOrdersInboxUrl('https://builder.indobase.in'),
    })
    assert.ok(message.text.length < 900)
    assert.match(message.text, /…and 4 more/)
    assert.match(message.text, /builder\.indobase\.in\/\?screen=orders/)
  })
})
