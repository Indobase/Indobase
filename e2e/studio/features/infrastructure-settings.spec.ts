import { expect } from '@playwright/test'

import { test } from '../utils/test.js'
import { toUrl } from '../utils/to-url.js'

test.describe('Project infrastructure settings', () => {
  test('loads infrastructure page with title', async ({ page, ref }) => {
    await page.goto(toUrl(`/project/${ref}/settings/infrastructure`))
    await expect(page.getByRole('heading', { name: 'Infrastructure' }).first()).toBeVisible()
    await expect(page.getByText(/General information regarding your server instance/)).toBeVisible()
  })
})
