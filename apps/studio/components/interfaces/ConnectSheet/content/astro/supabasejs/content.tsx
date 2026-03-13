import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env.local',
      language: 'bash',
      code: `
INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}
INDOBASE_KEY=${projectKeys.publishableKey ?? projectKeys.anonKey ?? 'your-anon-key'}
        `,
    },
    {
      name: 'src/db/indobase.js',
      language: 'js',
      code: `
import { createClient } from "indobase-js";

const indobaseUrl = import.meta.env.INDOBASE_URL;
const indobaseKey = import.meta.env.INDOBASE_KEY;

export const indobase = createClient(indobaseUrl, indobaseKey);
        `,
    },
    {
      name: 'src/pages/index.astro',
      language: 'html',
      code: `
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
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
