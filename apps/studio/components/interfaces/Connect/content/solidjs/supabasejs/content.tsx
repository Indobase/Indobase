import type { ContentFileProps } from 'components/interfaces/Connect/Connect.types'

import {
  ConnectTabs,
  ConnectTabTrigger,
  ConnectTabTriggers,
  ConnectTabContent,
} from 'components/interfaces/Connect/ConnectTabs'
import { SimpleCodeBlock } from 'ui'

const ContentFile = ({ projectKeys }: ContentFileProps) => {
  return (
    <ConnectTabs>
      <ConnectTabTriggers>
        <ConnectTabTrigger value=".env.local" />
        <ConnectTabTrigger value="utils/indobase.ts" />
        <ConnectTabTrigger value="src/App.jsx" />
      </ConnectTabTriggers>

      <ConnectTabContent value=".env.local">
        <SimpleCodeBlock className="bash" parentClassName="min-h-72">
          {[
            '',
            `INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
            projectKeys?.publishableKey
              ? `INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
              : `INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
            '',
          ].join('\n')}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="utils/indobase.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
import { createClient } from "@supabase/supabase-js";

const indobaseUrl = process.env.INDOBASE_URL;
const indobaseKey = process.env.${projectKeys.publishableKey ? 'INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'INDOBASE_ANON_KEY'};

export const indobase = createClient(indobaseUrl!, indobaseKey!);
        `}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/App.jsx">
        <SimpleCodeBlock className="jsx" parentClassName="min-h-72">
          {`
import { indobase } from '../utils/indobase'
import { createResource, For } from "solid-js";

async function getTodos() {
  const { data: todos } = await indobase.from("todos").select();
  return todos;
}

function App() {
  const [todos] = createResource(getTodos);

  return (
    <ul>
      <For each={todos()}>{(todo) => <li>{todo.name}</li>}</For>
    </ul>
  );
}

export default App;
`}
        </SimpleCodeBlock>
      </ConnectTabContent>
    </ConnectTabs>
  )
}

export default ContentFile
