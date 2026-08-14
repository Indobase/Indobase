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
    assert.equal(classifyStoreCommand('Mark that order as fulfilled')?.kind, 'order.status')
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
})
