
import {
  buildEmailLaunchUrl,
  makeEmailHandoffToken,
  resolveEmailBaseUrl,
} from './email-launch'
import {
  EMAIL_ALLOWED_ROLES,
  EMAIL_ROLE_DENIED_CODE,
  emailWorkspaceIdForProjectRef,
  isEmailRole,
  isEmailRoleDeniedMessage,
} from './email-launch-shared'

describe('email-launch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows the same org roles as Payments', () => {
    expect(EMAIL_ALLOWED_ROLES).toEqual(['owner', 'admin', 'developer', 'viewer'])
    expect(isEmailRole('owner')).toBe(true)
    expect(isEmailRole('guest')).toBe(false)
  })

  it('maps project ref to alphanumeric workspace id ≤20 (Notifuse VARCHAR limit)', () => {
    expect(emailWorkspaceIdForProjectRef('AbCdEfGhIjKlMnOpQrSt')).toBe('abcdefghijklmnopqrst')
    expect(emailWorkspaceIdForProjectRef('proj-123')).toBe('proj123')
    expect(emailWorkspaceIdForProjectRef('a'.repeat(40))).toHaveLength(20)
    expect(emailWorkspaceIdForProjectRef('proj-with-dashes-and-more-chars')).toBe(
      'projwithdashesandmor'
    )
  })

  it('detects role-denied messages', () => {
    expect(isEmailRoleDeniedMessage(EMAIL_ROLE_DENIED_CODE)).toBe(true)
    expect(isEmailRoleDeniedMessage('Ask an organization owner or admin')).toBe(true)
  })

  it('builds launch URL with token in fragment', () => {
    vi.stubEnv('INDOBASE_EMAIL_URL', 'https://email.indobase.in/')
    expect(resolveEmailBaseUrl()).toBe('https://email.indobase.in')
    expect(
      buildEmailLaunchUrl({
        handoffToken: 'abc.def.ghi',
        projectRef: 'proj_123',
      })
    ).toBe(
      'https://email.indobase.in/console/launch?project_ref=proj_123&from=studio#token=abc.def.ghi'
    )
  })

  it('mints HS256 JWT', () => {
    const secret = 'x'.repeat(32)
    const token = makeEmailHandoffToken(
      {
        aud: 'indobase-email',
        email: 'a@b.co',
        exp: Math.floor(Date.now() / 1000) + 60,
        iat: Math.floor(Date.now() / 1000),
        iss: 'https://studio.indobase.in',
        organization_name: 'org',
        organization_slug: 'org',
        project_name: 'P',
        project_ref: 'abcdefghij',
        role: 'owner',
        studio_url: 'https://studio.indobase.in',
        sub: 'user-1',
      },
      secret
    )
    expect(token.split('.')).toHaveLength(3)
  })
})
