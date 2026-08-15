# @indobase/builder-agent

Skills catalog and typed SDK for **Indobase Builder CFOS** agents and the Vite apps they generate.

## Install (monorepo)

```json
"@indobase/builder-agent": "file:../../packages/builder-agent"
```

## Skills

```ts
import {
  blueprintForAppType,
  composeGenerateSkillsHint,
  listSkillIds,
} from '@indobase/builder-agent'

composeGenerateSkillsHint('landing')
// → GENERATE hint with Vite stack + leads enquiry skill

blueprintForAppType('ecommerce').skills.map((s) => s.id)
// → react-app, indobase-wire, preview-and-live, ecommerce-commerce
```

## Storefront ABI types

```ts
import { indobaseWindow, type CommerceAbi } from '@indobase/builder-agent'

const commerce = indobaseWindow().indobase?.commerce
await commerce?.checkout.create({ items, customer })
```

## Agent HTTP client

```ts
import { createBuilderAgentClient } from '@indobase/builder-agent'

const client = createBuilderAgentClient({
  baseUrl: 'https://builder.indobase.in',
  sessionCookie: process.env.BUILDER_SESSION,
})
const session = await client.getSession()
```

Published customer sites must **not** use `BuilderAgentClient` — only the `window.indobase.*` ABIs.
