import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env',
      language: 'bash',
      code: [
        `VITE_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
        projectKeys?.publishableKey
          ? `VITE_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
          : `VITE_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
        '',
      ].join('\n'),
    },
    {
      name: 'app/utils/indobase.server.ts',
      language: 'ts',
      code: `
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "indobase-ssr";

export function createClient(request: Request) {
  const headers = new Headers();

  const indobase = createServerClient(
    process.env.VITE_INDOBASE_URL!,
    process.env.VITE_${projectKeys.publishableKey ? 'INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'INDOBASE_ANON_KEY'},
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
`,
    },
    {
      name: 'app/routes/_index.tsx',
      language: 'tsx',
      code: `
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

`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
