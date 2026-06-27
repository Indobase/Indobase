# Indobase Auth UI

Indobase Auth UI is a collection of pre-built UI components for authentication flows.

The main purpose of these components is to allow developers to get working on their apps quickly, while still being able to apply their own styling.

Auth UI is kept deliberately separate from auth helpers so that developers can migrate away from pre-built UI components as their UI system matures.

## Supported frameworks

- [React.js](https://reactjs.org/) — `@indobaseinc/auth-ui-react`
- [Svelte](https://svelte.dev/) — `@indobaseinc/auth-ui-svelte`

## Packages

- `@indobaseinc/auth-ui-shared` — shared TypeScript types and utilities
- `@indobaseinc/auth-ui-react` — React components
- `@indobaseinc/auth-ui-svelte` — Svelte components

Each package is 100% [TypeScript](https://www.typescriptlang.org/).

## Localization

Localizations are not bundled with the package to keep bundle size small. Copy the localization file you need from `packages/shared/src/localization/` and pass it to the `localization.variables` prop of the Auth component.

```tsx
import { Auth } from '@indobaseinc/auth-ui-react'
import * as ja from './path-to-localization-file.json'

<Auth
  supabaseClient={client}
  localization={{
    variables: ja
  }}
/>
```

## Development

From this directory:

```bash
pnpm install
pnpm build
```

Publish all three packages:

```bash
../../scripts/publish-indobase-auth-ui.sh
```
