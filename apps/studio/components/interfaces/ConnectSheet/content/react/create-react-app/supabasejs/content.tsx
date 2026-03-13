import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env.local',
      language: 'bash',
      code: [
        `REACT_APP_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
        projectKeys?.publishableKey
          ? `REACT_APP_INDOBASE_PUBLISHABLE_DEFAULT_KEY=${projectKeys.publishableKey}`
          : `REACT_APP_INDOBASE_ANON_KEY=${projectKeys.anonKey ?? 'your-anon-key'}`,
        '',
      ].join('\n'),
    },
    {
      name: 'utils/indobase.ts',
      language: 'ts',
      code: `
import { createClient } from "indobase-js";

const indobaseUrl = process.env.REACT_APP_INDOBASE_URL;
const indobaseKey = process.env.${projectKeys.publishableKey ? 'REACT_APP_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'REACT_APP_INDOBASE_ANON_KEY'};

export const indobase = createClient(indobaseUrl, indobaseKey);
        `,
    },
    {
      name: 'App.tsx',
      language: 'tsx',
      code: `
import { useState, useEffect } from 'react'
import { indobase } from './utils/indobase'

export default function App() {
  const [todos, setTodos] = useState([])

  useEffect(() => {
    async function getTodos() {
      const { data: todos } = await indobase.from('todos').select()

      if (todos) {
        setTodos(todos)
      }
    }

    getTodos()
  }, [])

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
