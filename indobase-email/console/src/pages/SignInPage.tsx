import { Button, Typography } from 'antd'
import { useSearch } from '@tanstack/react-router'
import { readEmailLastProjectRef } from '../lib/emailSessionStorage'
import { studioMarketingUrl, studioSignInUrl } from '../lib/studioAuthRedirect'

const { Title, Paragraph, Text } = Typography

/**
 * Public Email password sign-in is disabled — operators use Indobase Studio SSO.
 * Direct visits to email.indobase.in land here with a clear CTA (no silent jump to Studio).
 */
export function SignInPage() {
  const search = useSearch({ from: '/console/signin' })
  const projectRef =
    (typeof search.project_ref === 'string' && search.project_ref.trim()) ||
    readEmailLastProjectRef()

  const error = typeof search.error === 'string' ? search.error : null

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8FAFC',
        padding: '24px'
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: '#fff',
          borderRadius: 12,
          padding: '32px 28px',
          boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)'
        }}
      >
        <img
          src="/console/indobase-logo-wordmark.svg"
          alt="Indobase Email"
          style={{ display: 'block', width: 200, maxWidth: '100%', margin: '0 auto 24px' }}
        />
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          Open from Indobase Studio
        </Title>
        <Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
          Indobase Email uses your Studio account. Open Email from your project&apos;s Marketing
          hub — there is no separate Email password.
        </Paragraph>
        {error ? (
          <Paragraph
            type="danger"
            style={{
              textAlign: 'center',
              marginBottom: 16,
              padding: '8px 12px',
              background: '#fff1f0',
              borderRadius: 8
            }}
          >
            {error}
          </Paragraph>
        ) : null}
        <Button
          type="primary"
          block
          size="large"
          style={{ marginBottom: 12 }}
          onClick={() => {
            window.location.assign(studioMarketingUrl(projectRef))
          }}
        >
          {projectRef ? 'Open Marketing in Studio' : 'Open Studio'}
        </Button>
        <Button
          block
          size="large"
          onClick={() => {
            window.location.assign(studioSignInUrl({ projectRef }))
          }}
        >
          Sign in with Studio
        </Button>
        <Text
          type="secondary"
          style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 12 }}
        >
          Already signed in to Studio? Use Marketing → Email for your project.
        </Text>
      </div>
    </div>
  )
}
