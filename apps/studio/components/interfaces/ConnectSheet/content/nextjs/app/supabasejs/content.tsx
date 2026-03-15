import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env.local',
      language: 'bash',
      code: [
        `NEXT_PUBLIC_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
        projectKeys?.publishableKey
          ? `NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
          : `NEXT_PUBLIC_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
        '',
      ].join('\n'),
    },
    {
      name: 'page.tsx',
      language: 'tsx',
      code: `
import { createClient } from '@/utils/indobase/server'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const indobase = createClient(cookieStore)

  const { data: todos } = await indobase.from('todos').select()

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}
`,
    },
    {
      name: 'utils/indobase/server.ts',
      language: 'ts',
      code: `
import { createServerClient } from "indobase-ssr";
import { cookies } from "next/headers";

const indobaseUrl = process.env.NEXT_PUBLIC_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys?.publishableKey ? 'NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'NEXT_PUBLIC_INDOBASE_ANON_KEY'};

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient(
    indobaseUrl!,
    indobaseKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // The \`setAll\` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
`,
    },
    {
      name: 'utils/indobase/client.ts',
      language: 'ts',
      code: `
import { createBrowserClient } from "indobase-ssr";

const indobaseUrl = process.env.NEXT_PUBLIC_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys?.publishableKey ? 'NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'NEXT_PUBLIC_INDOBASE_ANON_KEY'};

export const createClient = () =>
  createBrowserClient(
    indobaseUrl!,
    indobaseKey!,
  );
`,
    },
    {
      name: 'utils/indobase/middleware.ts',
      language: 'ts',
      code: `
import { createServerClient } from "indobase-ssr";
import { type NextRequest, NextResponse } from "next/server";

const indobaseUrl = process.env.NEXT_PUBLIC_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys?.publishableKey ? 'NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'NEXT_PUBLIC_INDOBASE_ANON_KEY'};

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    indobaseUrl!,
    indobaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  return supabaseResponse
};
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

// [Joshen] Used as a dynamic import
// eslint-disable-next-line no-restricted-exports
export default ContentFile
