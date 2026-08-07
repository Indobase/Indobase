import { describe, expect, it } from 'vitest'

import {
  collectDeclaredCapabilities,
  planLaunchCapabilities,
  type LaunchPlannerResult,
} from './os-launch-planner-core'

function expectCaps(result: LaunchPlannerResult, caps: string[]) {
  expect(result.requiredCapabilities).toEqual(caps)
  for (const id of caps) {
    expect(result.reasons[id]).toBeTruthy()
    expect(result.reasons[id]).not.toMatch(/docker|tenant|swarm|traefik|provisioner|postgres host/i)
  }
  expect(result.readinessNotes.length).toBeGreaterThan(0)
  expect(result.readinessNotes.join(' ')).not.toMatch(/docker|tenant|swarm|traefik|provisioner/i)
}

describe('planLaunchCapabilities heuristics', () => {
  it('returns empty capabilities for a static landing page', () => {
    const result = planLaunchCapabilities({
      intent: 'Launch my business',
      payload: {
        artifacts: {
          'index.html':
            '<html><body><h1>Welcome</h1><p>Contact us anytime.</p></body></html>',
        },
      },
      provisionState: 'none',
    })
    expectCaps(result, [])
    expect(result.readinessNotes[0]).toMatch(/Hosting only/i)
  })

  it('detects auth from Better Auth / gotrue / login signals', () => {
    expectCaps(
      planLaunchCapabilities({
        payload: {
          sourceFiles: {
            'app/auth.ts': `import { betterAuth } from "better-auth"\nexport const auth = betterAuth({})`,
          },
        },
      }),
      ['auth'],
    )
    expectCaps(
      planLaunchCapabilities({
        intent: 'Add login so customers can sign in',
      }),
      ['auth'],
    )
    expectCaps(
      planLaunchCapabilities({
        payload: {
          artifacts: {
            'lib/session.ts': 'const session = await gotrue.getSession()',
          },
        },
      }),
      ['auth'],
    )
  })

  it('detects database from postgres / client / prisma signals', () => {
    expectCaps(
      planLaunchCapabilities({
        payload: {
          sourceFiles: {
            'db.ts': `import { createClient } from "@indobaseinc/js"\nconst db = createClient(url, key)\nawait db.from("orders").select()`,
          },
        },
      }),
      ['database'],
    )
    expectCaps(
      planLaunchCapabilities({
        intent: 'We need a database for customer records',
      }),
      ['database'],
    )
  })

  it('detects payments from stripe / razorpay / checkout', () => {
    expectCaps(
      planLaunchCapabilities({
        payload: {
          sourceFiles: {
            'checkout.ts': 'const session = await stripe.checkout.sessions.create({})',
          },
        },
      }),
      ['payments'],
    )
    expectCaps(
      planLaunchCapabilities({
        intent: 'Enable Razorpay checkout',
      }),
      ['payments'],
    )
  })

  it('detects email from smtp / resend (not bare marketing "email")', () => {
    expectCaps(
      planLaunchCapabilities({
        payload: {
          sourceFiles: {
            'mail.ts': 'import { Resend } from "resend"\nawait resend.emails.send({})',
          },
        },
      }),
      ['email'],
    )
    expectCaps(
      planLaunchCapabilities({
        payload: {
          artifacts: {
            'index.html': '<p>Email us at hello@example.com</p>',
          },
        },
      }),
      [],
    )
  })

  it('detects analytics from posthog (not bare "analytics" in HTML)', () => {
    expectCaps(
      planLaunchCapabilities({
        payload: {
          sourceFiles: {
            'analytics.ts': 'posthog.capture("$pageview")',
          },
        },
      }),
      ['analytics'],
    )
    expectCaps(
      planLaunchCapabilities({
        intent: 'Turn on product analytics',
      }),
      ['analytics'],
    )
  })

  it('detects storage from upload / storage.from / S3', () => {
    expectCaps(
      planLaunchCapabilities({
        payload: {
          sourceFiles: {
            'upload.ts': 'await client.storage.from("avatars").upload(path, file)',
          },
        },
      }),
      ['storage'],
    )
  })

  it('merges multiple capabilities from a full app corpus', () => {
    const result = planLaunchCapabilities({
      intent: 'Launch with login and payments',
      payload: {
        sourceFiles: {
          'auth.ts': 'import { betterAuth } from "better-auth"',
          'pay.ts': 'import Stripe from "stripe"',
          'db.ts': 'const url = process.env.DATABASE_URL',
          'track.ts': 'posthog.init(key)',
        },
      },
      provisionState: 'none',
    })
    expect(result.requiredCapabilities).toEqual(
      expect.arrayContaining(['auth', 'database', 'payments', 'analytics']),
    )
    expect(result.readinessNotes.join(' ')).toMatch(/set up automatically/i)
  })

  it('honors declared capabilities on auth_config', () => {
    expectCaps(
      planLaunchCapabilities({
        authConfig: {
          required_capabilities: ['commerce', 'events'],
        },
      }),
      ['payments', 'analytics'],
    )
  })

  it('collectDeclaredCapabilities normalizes aliases', () => {
    expect(
      collectDeclaredCapabilities({
        capabilities: ['login', 'db', 'commerce', 'events'],
      }),
    ).toEqual(['auth', 'database', 'payments', 'analytics'])
  })

  it('notes when backend is already ready', () => {
    const result = planLaunchCapabilities({
      intent: 'add login',
      provisionState: 'ready',
    })
    expectCaps(result, ['auth'])
    expect(result.readinessNotes.join(' ')).toMatch(/already available/i)
  })

  it('does not treat contact-email marketing copy as email capability', () => {
    const result = planLaunchCapabilities({
      payload: {
        artifacts: {
          'index.html':
            '<html><body><h1>Landing</h1><a href="mailto:hi@co.com">Email</a></body></html>',
        },
      },
    })
    expectCaps(result, [])
  })
})
