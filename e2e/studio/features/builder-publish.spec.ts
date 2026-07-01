import { expect } from '@playwright/test'

import { env } from '../env.config.js'
import { test } from '../utils/test.js'
import { toUrl } from '../utils/to-url.js'

test.describe('Builder publish path', () => {
  test('hosting settings show Publish in Builder', async ({ page, ref }) => {
    await page.goto(toUrl(`/project/${ref}/settings/general#hosting`))

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30000 })

    await expect(
      page.getByRole('button', { name: /Publish in Builder|Deployment in progress/ }),
    ).toBeVisible({ timeout: 30000 })

    await expect(page.getByText('Indobase Hosting')).toBeVisible()
  })

  test('builder launch API returns handoff when authenticated', async ({ page, ref }) => {
    test.skip(!env.AUTHENTICATION, 'Requires EMAIL/PASSWORD or GitHub credentials in e2e env')

    const response = await page.request.get(toUrl(`/api/platform/projects/${ref}/builder/launch`))

    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.url).toMatch(/\/launch/)
    expect(body.project_ref).toBe(ref)
    expect(body.token).toBeTruthy()
  })

  test('builder deploy API rejects missing authorization', async ({ page, ref }) => {
    const response = await page.request.post(toUrl(`/api/platform/projects/${ref}/deployments/builder`), {
      data: {
        artifacts: {
          'index.html': '<!doctype html><html><body>test</body></html>',
        },
      },
    })

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.message).toMatch(/authorization|token/i)
  })

  test('builder preflight API rejects missing authorization', async ({ page, ref }) => {
    const response = await page.request.post(toUrl(`/api/platform/projects/${ref}/builder/preflight`), {
      data: {},
    })

    expect(response.status()).toBe(401)
  })
})
