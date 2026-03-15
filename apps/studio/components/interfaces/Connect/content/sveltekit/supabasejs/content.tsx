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
        <ConnectTabTrigger value=".env.local" />
        <ConnectTabTrigger value="src/lib/indobaseClient.js" />
        <ConnectTabTrigger value="src/routes/+page.server.js" />
        <ConnectTabTrigger value="src/routes/+page.svelte" />
      </ConnectTabTriggers>

      <ConnectTabContent value=".env.local">
        <SimpleCodeBlock className="bash" parentClassName="min-h-72">
          {[
            '',
            `PUBLIC_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
            projectKeys?.publishableKey
              ? `PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
              : `PUBLIC_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
            '',
          ].join('\n')}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/lib/indobaseClient.js">
        <SimpleCodeBlock className="js" parentClassName="min-h-72">
          {`
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_INDOBASE_URL, ${projectKeys.publishableKey ? 'PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'PUBLIC_INDOBASE_ANON_KEY'} } from "$env/static/public"

const indobaseUrl = PUBLIC_INDOBASE_URL;
const indobaseKey = ${projectKeys.publishableKey ? 'PUBLIC_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'PUBLIC_INDOBASE_ANON_KEY'};

export const indobase = createClient(indobaseUrl, indobaseKey);
        `}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/routes/+page.server.js">
        <SimpleCodeBlock className="js" parentClassName="min-h-72">
          {`
import { indobase } from "$lib/indobaseClient";

export async function load() {
  const { data } = await indobase.from("countries").select();
  return {
    countries: data ?? [],
  };
}
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/routes/+page.svelte">
        <SimpleCodeBlock className="html" parentClassName="min-h-72">
          {`
<script>
  export let data;
</script>

<ul>
  {#each data.countries as country}
    <li>{country.name}</li>
  {/each}
</ul>
`}
        </SimpleCodeBlock>
      </ConnectTabContent>
    </ConnectTabs>
  )
}

export default ContentFile
