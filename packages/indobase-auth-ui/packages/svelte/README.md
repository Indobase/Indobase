# Indobase Auth UI Svelte

Pre-built Svelte authentication UI components for Indobase.

Install:

```bash
npm install @indobaseinc/indobase-js @indobaseinc/auth-ui-svelte
```

Usage:

```svelte
<script>
  import { createClient } from '@indobaseinc/indobase-js'
  import { Auth } from '@indobaseinc/auth-ui-svelte'

  const client = createClient('https://your-project.indobase.in', 'your-anon-key')
</script>

<Auth supabaseClient={client} />
```

See the [monorepo README](../../README.md) for localization and theming options.
