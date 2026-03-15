import type { ContentFileProps } from 'components/interfaces/Connect/Connect.types'

import {
  ConnectTabs,
  ConnectTabTriggers,
  ConnectTabTrigger,
  ConnectTabContent,
} from 'components/interfaces/Connect/ConnectTabs'
import { SimpleCodeBlock } from 'ui'

const ContentFile = ({ projectKeys }: ContentFileProps) => {
  return (
    <ConnectTabs>
      <ConnectTabTriggers>
        <ConnectTabTrigger value=".env" />
        <ConnectTabTrigger value="app/utils/indobase.server.ts" />
        <ConnectTabTrigger value="app/routes/_index.tsx" />
      </ConnectTabTriggers>

      <ConnectTabContent value=".env">
        <SimpleCodeBlock className="bash" parentClassName="min-h-72">
          {[
            '',
            `VITE_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
            projectKeys?.publishableKey
              ? `VITE_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
              : `VITE_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
            '',
          ].join('\n')}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="app/utils/indobase.server.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";

export function createClient(request: Request) {
  const headers = new Headers();

  const indobase = createServerClient(
    process.env.VITE_INDOBASE_URL!,
    process.env.VITE_${projectKeys.publishableKey ? 'INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'INDOBASE_ANON_KEY'};,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "") as {
            name: string;
            value: string;
          }[];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            )
          );
        },
      },
    }
  );

  return { indobase, headers };
}
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="app/routes/_index.tsx">
        <SimpleCodeBlock className="tsx" parentClassName="min-h-72">
          {`
import type { Route } from "./+types/home";
import { createClient } from "~/utils/indobase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { indobase } = createClient(request);
  const { data: todos } = await indobase.from("todos").select();

  return { todos };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <ul>
        {loaderData.todos?.map((todo) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
    </>
  );
}

`}
        </SimpleCodeBlock>
      </ConnectTabContent>
    </ConnectTabs>
  )
}

export default ContentFile
