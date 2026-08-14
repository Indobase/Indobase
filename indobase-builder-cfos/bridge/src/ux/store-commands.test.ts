import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_FACING_TOOL_NAMES } from '../production-launch/agent-surface.ts'
import {
  classifyStoreCommand,
  createMemoryStoreCommandDeps,
  executeStoreCommand,
} from './store-commands.ts'

describe('store commands (internal, not tools)', () => {
  it('classifies catalog mutations and queries', () => {
    assert.equal(
      classifyStoreCommand('Add a red Nike-style running shoe at ₹8,999 with sizes 7–11.')?.kind,
      'product.create',
    )
    assert.equal(classifyStoreCommand('Change the price of Apex Runner to ₹9,999')?.kind, 'product.update')
    assert.equal(classifyStoreCommand('Increase prices by 10%')?.kind, 'product.update')
    assert.equal(classifyStoreCommand('Set stock of Apex Runner Extra to 20')?.kind, 'inventory.update')
    assert.equal(classifyStoreCommand('Set stock of Apex Runner Extra to 20')?.stock, 20)
    assert.equal(classifyStoreCommand('Mark that order as paid')?.kind, 'order.status')
    assert.equal(classifyStoreCommand('Mark that order as paid')?.orderStatus, 'paid')
    assert.equal(classifyStoreCommand('Mark that order as fulfilled')?.kind, 'order.fulfill')
    assert.equal(classifyStoreCommand('Mark that order as fulfilled')?.fulfillmentStatus, 'fulfilled')
    assert.equal(classifyStoreCommand('Mark that order as fulfilled')?.orderStatus, undefined)
    assert.equal(classifyStoreCommand("Show me today's orders")?.kind, 'orders.query')
    assert.equal(classifyStoreCommand('Which products are low stock?')?.query, 'low-stock')
    assert.equal(classifyStoreCommand('Launch a premium sneaker store called UrbanThread'), null)
    assert.equal(classifyStoreCommand('Change the hero headline to Midnight drops'), null)
  })

  it('creates a product in the session catalog only', async () => {
    const deps = createMemoryStoreCommandDeps()
    const session = { projectRef: 'storeaaaa01' }
    const result = await executeStoreCommand({
      session,
      message: 'Add a red Nike-style running shoe at ₹8,999 with sizes 7–11.',
      deps,
    })
    assert.equal(result.ok, true)
    assert.equal(result.kind, 'product.create')
    assert.equal(result.snapshot.products.length, 1)
    assert.equal(result.snapshot.products[0]?.priceMinor, 899900)
    assert.match(result.snapshot.products[0]?.name || '', /running shoe/i)
    assert.doesNotMatch(result.message, /PocketBase/i)
  })

  it('rejects cross-workspace mutation with 403', async () => {
    const deps = createMemoryStoreCommandDeps({
      storeaaaa01: [{ id: 'p1', name: 'Apex Runner', priceMinor: 129900, stock: 8 }],
    })
    const denied = await executeStoreCommand({
      session: { projectRef: 'storeaaaa01' },
      requestedProjectRef: 'storebbbb01',
      message: 'Set stock of Apex Runner to 1',
      deps,
    })
    assert.equal(denied.status, 403)
    assert.equal(denied.code, 'forbidden')
    const stillA = await deps.listProducts('storeaaaa01')
    assert.equal(stillA[0]?.stock, 8)
    const b = await deps.listProducts('storebbbb01')
    assert.equal(b.length, 0)
  })

  it('does not add a sixth agent-facing tool', () => {
    assert.equal(AGENT_FACING_TOOL_NAMES.length, 5)
    assert.equal(
      (AGENT_FACING_TOOL_NAMES as readonly string[]).includes('setupShopCatalog'),
      false,
    )
    assert.equal((AGENT_FACING_TOOL_NAMES as readonly string[]).includes('product.create'), false)
  })

  it('mark fulfilled updates fulfillment only and leaves payment paid', async () => {
    const deps = createMemoryStoreCommandDeps(
      { storeaaaa01: [{ id: 'p1', name: 'Apex Runner', priceMinor: 129900, stock: 8 }] },
      {
        storeaaaa01: [
          {
            id: 'ordpaid1',
            payment_status: 'paid',
            fulfillment_status: 'unfulfilled',
            status: 'paid',
            email: 'buyer@indobase.in',
            amount_minor: 129900,
          },
        ],
      },
    )
    const result = await executeStoreCommand({
      session: { projectRef: 'storeaaaa01' },
      message: 'Mark that order as fulfilled',
      deps,
    })
    assert.equal(result.ok, true)
    assert.equal(result.kind, 'order.fulfill')
    assert.match(result.message, /fulfilled/i)
    assert.match(result.message, /Payment is paid/i)
    assert.doesNotMatch(result.message, /payment is fulfilled/i)
    const orders = await deps.listOrders!('storeaaaa01')
    assert.equal(orders[0]?.payment_status, 'paid')
    assert.equal(orders[0]?.fulfillment_status, 'fulfilled')
    assert.notEqual(orders[0]?.payment_status, 'fulfilled')
  })

  it('rejects fulfilling another workspace order with 403', async () => {
    const deps = createMemoryStoreCommandDeps(
      {},
      {
        storeaaaa01: [{ id: 'orda', payment_status: 'paid', fulfillment_status: 'unfulfilled' }],
        storebbbb01: [{ id: 'ordb', payment_status: 'paid', fulfillment_status: 'unfulfilled' }],
      },
    )
    const denied = await executeStoreCommand({
      session: { projectRef: 'storeaaaa01' },
      requestedProjectRef: 'storebbbb01',
      message: 'Mark that order as fulfilled',
      deps,
    })
    assert.equal(denied.status, 403)
    const stillB = await deps.listOrders!('storebbbb01')
    assert.equal(stillB[0]?.fulfillment_status, 'unfulfilled')
  })

  it('checkout-shaped seed stays pending payment and unfulfilled until paid/fulfill', async () => {
    const deps = createMemoryStoreCommandDeps(
      {},
      {
        storeaaaa01: [
          { id: 'neword', payment_status: 'pending', fulfillment_status: 'unfulfilled', status: 'pending' },
        ],
      },
    )
    const paid = await executeStoreCommand({
      session: { projectRef: 'storeaaaa01' },
      message: 'Mark that order as paid',
      deps,
    })
    assert.equal(paid.kind, 'order.status')
    const afterPaid = await deps.listOrders!('storeaaaa01')
    assert.equal(afterPaid[0]?.payment_status, 'paid')
    assert.equal(afterPaid[0]?.fulfillment_status, 'unfulfilled')
    const fulfilled = await executeStoreCommand({
      session: { projectRef: 'storeaaaa01' },
      message: 'Mark that order as fulfilled',
      deps,
    })
    assert.equal(fulfilled.kind, 'order.fulfill')
    const after = await deps.listOrders!('storeaaaa01')
    assert.equal(after[0]?.payment_status, 'paid')
    assert.equal(after[0]?.fulfillment_status, 'fulfilled')
  })
})
