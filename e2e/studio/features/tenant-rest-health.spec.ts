import { expect } from '@playwright/test'

import { test } from '../utils/test.js'

/**
 * Opt-in: point at a real tenant PostgREST base (dedicated data plane).
 * Example: E2E_TENANT_REST_URL=https://abcd.example.com/rest/v1
 *          E2E_TENANT_ANON_KEY=<matching anon JWT>
 */
test.describe('Tenant PostgREST health (opt-in)', () => {
  test.skip(
    !process.env.E2E_TENANT_REST_URL?.trim(),
    'Set E2E_TENANT_REST_URL to tenant PostgREST base URL (…/rest/v1)'
  )

  test('responds with a non-server-error status', async ({ request }) => {
    const base = process.env.E2E_TENANT_REST_URL!.replace(/\/?$/, '')
    const anon =
      process.env.E2E_TENANT_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_ANON_KEY?.trim()
    test.skip(!anon, 'Set E2E_TENANT_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in e2e env')

    const res = await request.get(`${base}/`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
    })
    const status = res.status()
    expect(status).toBeLessThan(500)
  })
})
