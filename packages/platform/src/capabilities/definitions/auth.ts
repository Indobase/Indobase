import type { CapabilityBindings } from '../../contracts/runtime'
import type { CapabilityDefinition } from '../registry'

/** Auth capability — GoTrue / data-plane session. No product host leakage. */
export const authCapability: CapabilityDefinition = {
  id: 'auth',
  label: 'Auth',
  intents: ['signIn', 'signUp', 'session', 'oauth', 'signOut'] as const,
  defaultPermissions: [
    'auth:signIn',
    'auth:signUp',
    'auth:session',
    'auth:oauth',
  ] as const,
  buildDefaultBindings({ dataPlane }): CapabilityBindings {
    const { url, anonKey } = dataPlane
    return {
      env: {
        VITE_INDOBASE_URL: url,
        VITE_INDOBASE_ANON_KEY: anonKey,
        NEXT_PUBLIC_INDOBASE_URL: url,
        NEXT_PUBLIC_INDOBASE_ANON_KEY: anonKey,
        INDOBASE_URL: url,
        INDOBASE_ANON_KEY: anonKey,
        EXPO_PUBLIC_INDOBASE_URL: url,
        EXPO_PUBLIC_INDOBASE_ANON_KEY: anonKey,
      },
      sdk: {
        package: '@indobaseinc/indobase-js',
        importHint: 'createClient',
      },
      endpoints: {
        auth: `${url.replace(/\/$/, '')}/auth/v1`,
      },
      notes: [
        'Use @indobaseinc/indobase-js createClient with URL + anon key from bindings.env',
        'Never put service-role keys in client bindings',
      ],
    }
  },
}
