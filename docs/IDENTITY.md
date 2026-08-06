# Identity

**Contract #1** · Package: `@indobase/platform/identity`

Everything in Indobase starts here. No Workspace, Document, Command, or Execution is valid without an actor and a project boundary.

## Canonical types

| Type | Meaning |
|------|---------|
| `OrganizationId` | Billing / plan / membership root |
| `ProjectId` / `ProjectRef` | Tenant boundary (`saas.projects.ref`) |
| `UserId` | Human GoTrue subject |
| `AgentId` | Non-human actor (Builder agent, Design agent, …) |
| `Role` | `owner` \| `admin` \| `developer` \| `viewer` (+ future) |
| `Permission` | Fine-grained string (`auth:signIn`, `checkout:create`, …) |

## Actor

```ts
type PlatformActor =
  | { kind: 'user'; userId: UserId; organizationId?: OrganizationId; role?: Role }
  | { kind: 'agent'; agentId: AgentId; onBehalfOf?: UserId; organizationId?: OrganizationId }
  | { kind: 'system'; reason: string }
```

## Rules

1. Studio remains the source of membership truth; the kernel **wraps** claims, it does not replace GoTrue.
2. Project ref is the only public tenant key in data-plane URLs and Execution targets.
3. Permissions are granted via Capabilities + Role, never hard-coded product checks in Builder.
4. Agents never impersonate without an explicit `onBehalfOf` / system reason.

## Wrap points (existing)

- Studio SSO / handoff JWTs  
- `saas.organization_members` roles  
- Builder MCP / handoff claims (`project_ref`, `sub`)  
