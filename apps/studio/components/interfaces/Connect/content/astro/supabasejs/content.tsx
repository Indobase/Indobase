import type { ContentFileProps } from 'components/interfaces/Connect/Connect.types'
import {
  ConnectTabContent,
  ConnectTabTrigger,
  ConnectTabTriggers,
  ConnectTabs,
} from 'components/interfaces/Connect/ConnectTabs'
import { SimpleCodeBlock } from 'ui'

const ContentFile = ({ projectKeys }: ContentFileProps) => {
  return (
    <ConnectTabs>
      <ConnectTabTriggers>
        <ConnectTabTrigger value=".env.local" />
        <ConnectTabTrigger value="src/db/indobase.js" />
        <ConnectTabTrigger value="src/pages/index.astro" />
      </ConnectTabTriggers>

      <ConnectTabContent value=".env.local">
        <SimpleCodeBlock className="bash" parentClassName="min-h-72">
          {`
INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}
INDOBASE_KEY=${projectKeys.publishableKey ?? projectKeys.anonKey ?? 'your-anon-key'}
        `}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/db/indobase.js">
        <SimpleCodeBlock className="js" parentClassName="min-h-72">
          {`
import { createClient } from "@supabase/supabase-js";

const indobaseUrl = import.meta.env.INDOBASE_URL;
const indobaseKey = import.meta.env.INDOBASE_KEY;

export const indobase = createClient(indobaseUrl, indobaseKey);
        `}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/pages/index.astro">
        <SimpleCodeBlock className="html" parentClassName="min-h-72">
          {`
---
import { indobase } from '../db/indobase';

const { data, error } = await indobase.from("todos").select('*');
---

{
  (
    <ul>
      {data.map((entry) => (
        <li>{entry.name}</li>
      ))}
    </ul>
  )
}
`}
        </SimpleCodeBlock>
      </ConnectTabContent>
    </ConnectTabs>
  )
}

export default ContentFile
