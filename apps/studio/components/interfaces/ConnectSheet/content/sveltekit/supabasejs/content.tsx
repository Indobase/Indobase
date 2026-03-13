import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env.local',
      language: 'bash',
      code: [
        `PUBLIC_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
        projectKeys?.publishableKey
          ? `PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
          : `PUBLIC_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
        '',
      ].join('\n'),
    },
    {
      name: 'src/lib/indobaseClient.js',
      language: 'js',
      code: `
import { createClient } from "indobase-js";
import { PUBLIC_INDOBASE_URL, ${projectKeys.publishableKey ? 'PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'PUBLIC_INDOBASE_ANON_KEY'} } from "$env/static/public"

const indobaseUrl = PUBLIC_INDOBASE_URL;
const indobaseKey = ${projectKeys.publishableKey ? 'PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'PUBLIC_INDOBASE_ANON_KEY'};

export const indobase = createClient(indobaseUrl, indobaseKey);
        `,
    },
    {
      name: 'src/routes/+page.server.js',
      language: 'js',
      code: `
import { indobase } from "$lib/indobaseClient";

export async function load() {
  const { data } = await indobase.from("countries").select();
  return {
    countries: data ?? [],
  };
}
`,
    },
    {
      name: 'src/routes/+page.svelte',
      language: 'html',
      code: `
<script>
  export let data;
</script>

<ul>
  {#each data.countries as country}
    <li>{country.name}</li>
  {/each}
</ul>
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
