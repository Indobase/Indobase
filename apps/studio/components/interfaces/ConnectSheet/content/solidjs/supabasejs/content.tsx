import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env.local',
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
      name: 'utils/indobase.ts',
      language: 'ts',
      code: `
import { createClient } from "indobase-js";

const indobaseUrl = import.meta.env.VITE_INDOBASE_URL;
const indobaseKey = import.meta.env.${projectKeys.publishableKey ? 'VITE_INDOBASE_PUBLISHABLE_DEFAULT_KEY' : 'VITE_INDOBASE_ANON_KEY'};

export const indobase = createClient(indobaseUrl, indobaseKey);
`,
    },
    {
      name: 'src/App.tsx',
      language: 'tsx',
      code: `
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
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
