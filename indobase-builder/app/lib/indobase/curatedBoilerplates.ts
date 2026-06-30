import type { Template } from '~/types/template';

/**
 * Community-maintained starters that map cleanly to Indobase (Supabase-compatible auth + Postgres).
 * Sources verified on GitHub; imported via /api/github-template and rebranded on import.
 */
export const CURATED_WEB_BOILERPLATES: Template[] = [
  {
    name: 'React Supabase Auth',
    label: 'React Supabase Auth',
    description:
      'Vite + React auth boilerplate with protected routes, session context, and React Router (mmvergara/react-supabase-auth-template)',
    category: 'product',
    featured: true,
    indobaseAdaptable: true,
    githubRepo: 'mmvergara/react-supabase-auth-template',
    tags: ['auth', 'protected-routes', 'vite', 'react', 'router', 'boilerplate'],
    aliases: ['react supabase auth', 'protected routes template', 'session context auth'],
    icon: 'i-ph:shield-check',
  },
  {
    name: 'React Auth OAuth',
    label: 'React Auth + OAuth',
    description:
      'Production auth starter with email/password, OAuth providers, password recovery, and protected dashboard (akineni/react-auth-app)',
    category: 'product',
    featured: true,
    indobaseAdaptable: true,
    githubRepo: 'akineni/react-auth-app',
    tags: ['auth', 'oauth', 'google', 'github', 'password-reset', 'vite', 'react'],
    aliases: ['oauth template', 'react auth app', 'password recovery auth'],
    icon: 'i-ph:key',
  },
  {
    name: 'Vite Supabase Starter',
    label: 'Vite + shadcn Starter',
    description:
      'Modern Vite + React 19 + TanStack Router/Query + shadcn/ui with optional Supabase patterns (kortix-ai/vite-supabase-starter)',
    category: 'framework',
    indobaseAdaptable: true,
    githubRepo: 'kortix-ai/vite-supabase-starter',
    tags: ['vite', 'shadcn', 'tanstack', 'react', 'typescript', 'starter'],
    aliases: ['vite supabase starter', 'shadcn supabase', 'tanstack supabase'],
    icon: 'i-bolt:shadcn',
  },
];

export const CURATED_MOBILE_BOILERPLATES: Template[] = [
  {
    name: 'Expo Auth NativeWind',
    label: 'Expo Auth (NativeWind)',
    description:
      'Expo Router mobile auth template with NativeWind styling, TypeScript, and Supabase session handling (Owusu1946/react-native-auth-template)',
    category: 'mobile',
    featured: true,
    indobaseAdaptable: true,
    githubRepo: 'Owusu1946/react-native-auth-template',
    tags: ['expo', 'mobile', 'auth', 'nativewind', 'react-native', 'typescript'],
    aliases: ['expo auth template', 'nativewind auth', 'react native auth'],
    icon: 'i-bolt:expo',
  },
  {
    name: 'Expo Production Kit',
    label: 'Expo Production Kit',
    description:
      'Production Expo kit with passwordless OTP auth, Expo Router guards, TanStack Query, NativeWind, and EAS scaffolding (robertguss/expo-supabase-starter-kit)',
    category: 'mobile',
    featured: true,
    indobaseAdaptable: true,
    githubRepo: 'robertguss/expo-supabase-starter-kit',
    tags: ['expo', 'mobile', 'production', 'otp', 'tanstack', 'eas', 'router'],
    aliases: ['expo production kit', 'expo supabase starter kit', 'mobile starter kit'],
    icon: 'i-ph:device-mobile',
  },
  {
    name: 'Expo App',
    label: 'Expo App (Bolt)',
    description: 'Lightweight Expo starter for cross-platform mobile apps in WebContainer preview',
    category: 'mobile',
    indobaseAdaptable: true,
    githubRepo: 'xKevIsDev/bolt-expo-template',
    tags: ['mobile', 'expo', 'android', 'iphone'],
    aliases: ['bolt expo', 'expo bolt template'],
    icon: 'i-bolt:expo',
  },
];

export const CURATED_BOILERPLATES: Template[] = [...CURATED_WEB_BOILERPLATES, ...CURATED_MOBILE_BOILERPLATES];

export const INDOBASE_ADAPTATION_PROMPT = `
INDOBASE BACKEND ADAPTATION (required):
- Replace @supabase/supabase-js with @indobaseinc/indobase-js only.
- Use VITE_INDOBASE_URL / VITE_INDOBASE_ANON_KEY for web, or EXPO_PUBLIC_INDOBASE_URL / EXPO_PUBLIC_INDOBASE_ANON_KEY for Expo.
- Prefer a single client module at src/lib/indobase.ts (or lib/indobase.ts).
- Keep Vite dev server on port 5173 with host: true for Builder preview.
- Run SQL migrations from the template in Studio if the template ships schema files.
- Do not add Stripe or Supabase Cloud-only services unless the user explicitly asks.
`;
