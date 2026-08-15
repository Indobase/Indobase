import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'

import { AGENT_FACING_TOOL_NAMES } from './agent-surface.ts'
import {
  AGENT_PRIMITIVE_REJECTED_CODE,
  AGENT_PRIMITIVE_REJECTED_MESSAGE,
  PLATFORM_PRIMITIVE_TOOL_PATHS,
  agentPrimitiveRejectedBody,
  isPlatformPrimitiveToolPath,
  rejectAgentPrimitiveIfNeeded,
} from './agent-primitive-guard.ts'

describe('five-tool physical boundary', () => {
  it('keeps exactly five agent-facing tools', () => {
    assert.equal(AGENT_FACING_TOOL_NAMES.length, 5)
    assert.ok(!AGENT_FACING_TOOL_NAMES.includes('guidedBackend' as never))
    assert.ok(!AGENT_FACING_TOOL_NAMES.includes('ensureDatabase' as never))
  })

  it('lists guidedBackend and ensure* as primitive HTTP paths', () => {
    assert.ok(isPlatformPrimitiveToolPath('/api/os/tools/guidedBackend'))
    assert.ok(isPlatformPrimitiveToolPath('/api/os/tools/ensureDatabase'))
    assert.ok(isPlatformPrimitiveToolPath('/api/os/tools/ensureLogin'))
    assert.ok(isPlatformPrimitiveToolPath('/api/os/tools/applySchema'))
    assert.equal(isPlatformPrimitiveToolPath('/api/os/tools/launchProductionApp'), false)
    assert.equal(isPlatformPrimitiveToolPath('/api/os/tools/connectGateway'), false)
    assert.equal(isPlatformPrimitiveToolPath('/api/os/tools/followups'), false)
    assert.ok(PLATFORM_PRIMITIVE_TOOL_PATHS.includes('/api/os/tools/guidedBackend'))
  })

  it('rejects agent-header invocations with business language', async () => {
    const app = new Hono()
    app.use('/api/os/tools/*', async (c, next) => {
      const denied = rejectAgentPrimitiveIfNeeded(c)
      if (denied) return denied
      return next()
    })
    app.post('/api/os/tools/guidedBackend', (c) => c.json({ ok: true, leaked: true }))
    app.post('/api/os/tools/launchProductionApp', (c) => c.json({ ok: true, tool: 'launch' }))

    const blocked = await app.request('/api/os/tools/guidedBackend', {
      method: 'POST',
      headers: { 'X-Indobase-Agent-Username': 'ib_agent_1' },
    })
    assert.equal(blocked.status, 403)
    const body = (await blocked.json()) as { ok: boolean; code: string; message: string }
    assert.equal(body.ok, false)
    assert.equal(body.code, AGENT_PRIMITIVE_REJECTED_CODE)
    assert.equal(body.message, AGENT_PRIMITIVE_REJECTED_MESSAGE)
    assert.doesNotMatch(body.message, /guidedBackend|ensureDatabase|PocketBase/i)

    const allowed = await app.request('/api/os/tools/launchProductionApp', {
      method: 'POST',
      headers: { 'X-Indobase-Agent-Username': 'ib_agent_1' },
    })
    assert.equal(allowed.status, 200)
    assert.equal(((await allowed.json()) as { tool?: string }).tool, 'launch')
  })

  it('rejects signed-in cookie/session HTTP on primitives (403), not only agent header', async () => {
    const app = new Hono()
    app.use('/api/os/tools/*', async (c, next) => {
      const denied = rejectAgentPrimitiveIfNeeded(c)
      if (denied) return denied
      return next()
    })
    for (const path of [
      '/api/os/tools/setupShopCatalog',
      '/api/os/tools/guidedBackend',
      '/api/os/tools/applySchema',
      '/api/os/tools/ensureDatabase',
      '/api/os/tools/placeTestShopOrder',
      '/api/os/tools/wireCheckout',
    ]) {
      app.post(path, (c) => c.json({ ok: true, leaked: true }))
    }
    app.post('/api/os/tools/connectGateway', (c) => c.json({ ok: true, tool: 'connect' }))

    for (const path of [
      '/api/os/tools/setupShopCatalog',
      '/api/os/tools/guidedBackend',
      '/api/os/tools/applySchema',
      '/api/os/tools/ensureDatabase',
      '/api/os/tools/placeTestShopOrder',
    ]) {
      const res = await app.request(path, {
        method: 'POST',
        headers: { cookie: 'ib_os_session=valid-signed-in-token' },
      })
      assert.equal(res.status, 403, path)
      assert.equal(((await res.json()) as { code?: string }).code, AGENT_PRIMITIVE_REJECTED_CODE)
    }

    const publicOk = await app.request('/api/os/tools/connectGateway', {
      method: 'POST',
      headers: { cookie: 'ib_os_session=valid-signed-in-token' },
    })
    assert.equal(publicOk.status, 200)
  })

  it('allows the followups UI helper without expanding the five-tool catalog', async () => {
    const app = new Hono()
    app.use('/api/os/tools/*', async (c, next) => {
      const denied = rejectAgentPrimitiveIfNeeded(c)
      if (denied) return denied
      return next()
    })
    app.post('/api/os/tools/followups', (c) => c.json({ ok: true, tool: 'followups' }))
    const res = await app.request('/api/os/tools/followups', { method: 'POST' })
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { tool?: string }).tool, 'followups')
    assert.equal(AGENT_FACING_TOOL_NAMES.length, 5)
  })

  it('does not allow cookie callers to invoke primitives over HTTP', async () => {
    const app = new Hono()
    app.use('/api/os/tools/*', async (c, next) => {
      const denied = rejectAgentPrimitiveIfNeeded(c)
      if (denied) return denied
      return next()
    })
    app.post('/api/os/tools/guidedBackend', (c) => c.json({ ok: true, job: true }))
    const res = await app.request('/api/os/tools/guidedBackend', { method: 'POST' })
    assert.equal(res.status, 403)
    assert.equal(((await res.json()) as { code?: string }).code, AGENT_PRIMITIVE_REJECTED_CODE)
  })

  it('rejected body never names internals', () => {
    const body = agentPrimitiveRejectedBody()
    assert.doesNotMatch(body.message, /guidedBackend|ensure\*|PocketBase|Studio|fetch failed/i)
  })
})
