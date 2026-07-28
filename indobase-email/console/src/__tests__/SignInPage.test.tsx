import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SignInPage } from '../pages/SignInPage'
import { AuthProvider } from '../contexts/AuthContext'
import { App } from 'antd'

vi.mock('../services/api/auth', () => ({
  authService: {
    signIn: vi.fn(),
    verifyCode: vi.fn(),
    oidcExchange: vi.fn(),
    getCurrentUser: vi.fn().mockRejectedValue(new Error('Not authenticated')),
    logout: vi.fn().mockResolvedValue(undefined)
  },
  isRootUser: vi.fn().mockReturnValue(false)
}))

const mockSearch: { email?: string; project_ref?: string; error?: string; oidc_error?: string } =
  {}

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useSearch: vi.fn(() => mockSearch)
  }
})

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <App>
      <AuthProvider>{ui}</AuthProvider>
    </App>
  )
}

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearch.email = undefined
    mockSearch.project_ref = undefined
    mockSearch.error = undefined
    mockSearch.oidc_error = undefined
    ;(window as unknown as { STUDIO_PUBLIC_URL?: string }).STUDIO_PUBLIC_URL =
      'https://studio.indobase.in'
  })

  it('shows Studio handoff landing instead of auto-redirecting', () => {
    renderWithProviders(<SignInPage />)

    expect(screen.getByText(/Open from Indobase Studio/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Studio/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign in with Studio/i })).toBeInTheDocument()
  })

  it('shows handoff error when present in search params', () => {
    mockSearch.error = 'invalid handoff token'
    renderWithProviders(<SignInPage />)

    expect(screen.getByText('invalid handoff token')).toBeInTheDocument()
  })
})
