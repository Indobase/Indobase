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
        <ConnectTabTrigger value="App.tsx" />
      </ConnectTabTriggers>

      <ConnectTabContent value=".env.local">
        <SimpleCodeBlock className="bash" parentClassName="min-h-72">
          {[
            '',
            `REACT_APP_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
            projectKeys?.publishableKey
              ? `REACT_APP_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
              : `REACT_APP_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
            '',
          ].join('\n')}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="utils/indobase.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
import { createClient } from "@supabase/supabase-js";

const indobaseUrl = process.env.REACT_APP_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys.publishableKey ? 'REACT_APP_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'REACT_APP_INDOBASE_ANON_KEY'};

export const indobase = createClient(indobaseUrl, indobaseKey);
        `}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="App.tsx">
        <SimpleCodeBlock className="tsx" parentClassName="min-h-72">
          {`
import { useState, useEffect } from 'react'
import { indobase } from '../utils/indobase'

function Page() {
  const [todos, setTodos] = useState([])

  useEffect(() => {
    function getTodos() {
      const { data: todos } = await indobase.from('todos').select()

      if (todos.length > 1) {
        setTodos(todos)
      }
    }

    getTodos()
  }, [])

  return (
    <div>
      {todos.map((todo) => (
        <li key={todo}>{todo}</li>
      ))}
    </div>
  )
}
export default Page
`}
        </SimpleCodeBlock>
      </ConnectTabContent>
    </ConnectTabs>
  )
}

export default ContentFile
