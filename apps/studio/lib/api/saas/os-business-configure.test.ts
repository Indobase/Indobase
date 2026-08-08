import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildOsBusinessConfig,
  configureOsBusiness,
  createStudioBusinessConfigurePort,
  mergeOsBusinessConfig,
} from './os-business-configure'

vi.mock('./platform', () => ({
  ensureSaasTables: vi.fn(),
  getGotrueUserId: vi.fn(() => 'user-1'),
}))

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

vi.mock('./os-workspace', () => ({
  getOsWorkspace: vi.fn(),
}))

import { executeQuery } from './query'
import { getOsWorkspace } from './os-workspace'

describe('buildOsBusinessConfig', () => {
  it('builds SEO stubs from workspace name and discovery expectation URLs', () => {
    const config = buildOsBusinessConfig({
      liveUrl: 'https://acme.indobase.in/',
      workspaceName: 'Acme Cafe',
      configuredAt: '2026-08-07T12:00:00.000Z',
    })

    expect(config.live_url).toBe('https://acme.indobase.in')
    expect(config.seo.title).toBe('Acme Cafe')
    expect(config.seo.description).toContain('Acme Cafe')
    expect(config.seo.status).toBe('ready')
    expect(config.discovery.robots_url).toBe('https://acme.indobase.in/robots.txt')
    expect(config.discovery.sitemap_url).toBe('https://acme.indobase.in/sitemap.xml')
    expect(config.discovery.status).toBe('pending')
    expect(config.domain.public_url).toBe('https://acme.indobase.in')
    expect(config.domain.status).toBe('ready')
    expect(config.domain.note).not.toMatch(/docker|traefik|provisioner/i)
    expect(config.capabilities).toBeUndefined()
  })

  it('marks payments/email pending and analytics ready when those capabilities were ensured', () => {
    const config = buildOsBusinessConfig({
      liveUrl: 'https://ws.indobase.in',
      workspaceName: 'Shop',
      requiredCapabilities: ['payments', 'email', 'analytics', 'auth'],
    })

    expect(config.capabilities).toEqual({
      payments: expect.objectContaining({ status: 'pending' }),
      email: expect.objectContaining({ status: 'pending' }),
      analytics: expect.objectContaining({ status: 'ready' }),
    })
    expect(config.capabilities?.payments?.note).not.toMatch(/razorpay|stripe|gateway/i)
  })
})

describe('mergeOsBusinessConfig', () => {
  it('keeps existing robots/sitemap URLs when already recorded', () => {
    const next = buildOsBusinessConfig({
      liveUrl: 'https://new.indobase.in',
      workspaceName: 'New Name',
      configuredAt: '2026-08-07T13:00:00.000Z',
    })
    const merged = mergeOsBusinessConfig({
      existing: {
        discovery: {
          robots_url: 'https://old.indobase.in/robots.txt',
          sitemap_url: 'https://old.indobase.in/sitemap.xml',
          status: 'pending',
        },
      },
      next,
    })

    expect(merged.discovery.robots_url).toBe('https://old.indobase.in/robots.txt')
    expect(merged.discovery.sitemap_url).toBe('https://old.indobase.in/sitemap.xml')
    expect(merged.seo.title).toBe('New Name')
    expect(merged.live_url).toBe('https://new.indobase.in')
  })
})

describe('configureOsBusiness', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('persists os_business_config on auth_config', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        data: [{ auth_config: {} }],
        error: null,
      } as never)
      .mockResolvedValueOnce({ data: [], error: null } as never)

    const result = await configureOsBusiness({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws_1.indobase.in',
      workspaceName: 'Launch Co',
      gotrueId: 'user-1',
      requiredCapabilities: ['analytics'],
    })

    expect(result.ok).toBe(true)
    expect(result.persist_ok).toBe(true)
    expect(result.config.seo.title).toBe('Launch Co')
    expect(result.config.capabilities?.analytics?.status).toBe('ready')

    const persistCall = vi.mocked(executeQuery).mock.calls[1]
    expect(persistCall?.[0]?.query).toContain('os_business_config')
    expect(persistCall?.[0]?.parameters?.[0]).toBe('ws_1')
    const stored = JSON.parse(String(persistCall?.[0]?.parameters?.[1]))
    expect(stored.seo.title).toBe('Launch Co')
    expect(stored.discovery.robots_url).toBe('https://ws_1.indobase.in/robots.txt')
  })

  it('soft-fails when persist throws without inventing infra jargon', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({ data: [{ auth_config: {} }], error: null } as never)
      .mockResolvedValueOnce({ data: null, error: new Error('db down') } as never)

    const result = await configureOsBusiness({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws_1.indobase.in',
      workspaceName: 'Soft',
      gotrueId: 'user-1',
    })

    expect(result.ok).toBe(false)
    expect(result.persist_ok).toBe(false)
    expect(result.message).toMatch(/still live/i)
    expect(result.message).not.toMatch(/docker|traefik|postgres/i)
  })
})

describe('createStudioBusinessConfigurePort', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads workspace name, persists config, and always returns ok for Launch soft-fail', async () => {
    vi.mocked(getOsWorkspace).mockResolvedValue({
      ref: 'ws_1',
      name: 'Port Cafe',
      organization_slug: 'org',
      organization_id: 1,
      status: 'ACTIVE_HEALTHY',
      data_plane_mode: 'isolated_stack',
      provision_state: 'ready',
    })
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({ data: [{ auth_config: {} }], error: null } as never)
      .mockResolvedValueOnce({ data: [], error: null } as never)

    const port = createStudioBusinessConfigurePort({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await port.configure({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws_1.indobase.in',
      requiredCapabilities: ['payments'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.details?.seo_title).toBe('Port Cafe')
      expect(result.details?.persist_ok).toBe(true)
      expect(result.details?.robots_url).toBe('https://ws_1.indobase.in/robots.txt')
      expect(
        (result.details?.capabilities as { payments?: { status: string } })?.payments?.status,
      ).toBe('pending')
    }
  })

  it('returns ok with configure_error details when workspace load and persist both blow up', async () => {
    vi.mocked(getOsWorkspace).mockRejectedValue(new Error('boom'))
    vi.mocked(executeQuery).mockRejectedValue(new Error('boom'))

    const port = createStudioBusinessConfigurePort({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await port.configure({
      workspaceRef: 'ws_1',
      liveUrl: 'https://ws_1.indobase.in',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.details?.configured).toBe(false)
      expect(String(result.details?.message)).toMatch(/still live/i)
    }
  })
})
