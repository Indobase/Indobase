import type { ContentFileProps } from 'components/interfaces/Connect/Connect.types'

import {
  ConnectTabContent,
  ConnectTabs,
  ConnectTabTrigger,
  ConnectTabTriggers,
} from 'components/interfaces/Connect/ConnectTabs'
import { SimpleCodeBlock } from 'ui'

const ContentFile = ({ projectKeys }: ContentFileProps) => {
  return (
    <ConnectTabs>
      <ConnectTabTriggers>
        <ConnectTabTrigger value=".env.local" />
        <ConnectTabTrigger value="page.tsx" />
        <ConnectTabTrigger value="utils/indobase/server.ts" />
        <ConnectTabTrigger value="utils/indobase/client.ts" />
        <ConnectTabTrigger value="utils/indobase/middleware.ts" />
      </ConnectTabTriggers>

      <ConnectTabContent value=".env.local">
        <SimpleCodeBlock className="bash" parentClassName="min-h-72">
          {[
            '',
            `NEXT_PUBLIC_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
            projectKeys?.publishableKey
              ? `NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
              : `NEXT_PUBLIC_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
            '',
          ].join('\n')}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="page.tsx">
        <SimpleCodeBlock className="tsx" parentClassName="min-h-72">
          {`
import { createClient } from '@/utils/indobase/server'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const indobase = createClient(cookieStore)

  const { data: todos } = await indobase.from('todos').select()

  return (
    <ul>
      {todos?.map((todo) => (
        <li>{todo}</li>
      ))}
    </ul>
  )
}
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="utils/indobase/server.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const indobaseUrl = process.env.NEXT_PUBLIC_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys?.publishableKey ? 'NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'NEXT_PUBLIC_INDOBASE_ANON_KEY'};

export const createClient = (cookieStore: ReturnType<typeof cookies>) => {
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
`}
        </SimpleCodeBlock>
      </ConnectTabContent>
      <ConnectTabContent value="utils/indobase/client.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
import { createBrowserClient } from "@supabase/ssr";

const indobaseUrl = process.env.NEXT_PUBLIC_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys?.publishableKey ? 'NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'NEXT_PUBLIC_INDOBASE_ANON_KEY'};

export const createClient = () =>
  createBrowserClient(
    indobaseUrl!,
    indobaseKey!,
  );
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="utils/indobase/middleware.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const indobaseUrl = process.env.NEXT_PUBLIC_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys?.publishableKey ? 'NEXT_PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'NEXT_PUBLIC_INDOBASE_ANON_KEY'};

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let indobaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const indobase = createServerClient(
    indobaseUrl!,
    indobaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          indobaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            indobaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  return indobaseResponse
};
`}
        </SimpleCodeBlock>
      </ConnectTabContent>
    </ConnectTabs>
  )
}

// [Joshen] Used as a dynamic import
// eslint-disable-next-line no-restricted-exports
export default ContentFile
