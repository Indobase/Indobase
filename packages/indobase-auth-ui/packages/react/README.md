# Indobase Auth UI React

Pre-built React authentication UI components for Indobase.

Install:

```bash
npm install @indobaseinc/indobase-js @indobaseinc/auth-ui-react
```

Usage:

```tsx
import { createClient } from '@indobaseinc/indobase-js'
import { Auth } from '@indobaseinc/auth-ui-react'

const client = createClient('https://your-project.indobase.in', 'your-anon-key')

export default function App() {
  return <Auth supabaseClient={client} />
}
```

See the [monorepo README](../../README.md) for localization and theming options.
