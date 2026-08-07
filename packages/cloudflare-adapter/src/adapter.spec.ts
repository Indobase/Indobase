import { describe, expect, it } from 'vitest'
import {
  EMPTY_SNAPSHOT_ID,
  createCommandId,
  createEventBus,
} from '@indobase/platform'

import {
  applyProposalsViaCommands,
  assertNoVendorBranding,
  createCloudflareOsAdapter,
  createMutationProposal,
  hasVendorBranding,
  mapCfConcept,
  sessionToAgentContext,
  startAgentTurn,
  stripVendorBranding,
} from './index'

describe('@indobase/cloudflare-adapter', () => {
  it('maps CF gadgets to Indobase Apps', () => {
    const row = mapCfConcept('gadget')
    expect(row.indobase).toBe('App')
    expect(row.publicLabel).toBe('App')
    expect(row.contract).toBe('Documents')
  })

  it('strips vendor branding from customer copy', () => {
    const raw =
      'Open Cloudflare OS and install a Gadget from os.cloudflare.app with Workers AI'
    const clean = stripVendorBranding(raw)
    expect(hasVendorBranding(clean)).toBe(false)
    expect(clean).toContain('Indobase Builder')
    expect(clean).toContain('an App')
    expect(clean).toContain('Indobase Agent')
    expect(clean).not.toMatch(/Cloudflare/i)
    expect(() => assertNoVendorBranding(clean)).not.toThrow()
    expect(() => assertNoVendorBranding(raw)).toThrow(/vendor/i)
  })

  it('maps MutationProposal → workspace Commands (never raw writes)', () => {
    const commandId = createCommandId()
    const proposal = createMutationProposal({
      commandId,
      baseSnapshotId: EMPTY_SNAPSHOT_ID,
      files: [{ kind: 'upsert', path: 'src/App.tsx', content: 'export default function App() { return null }' }],
    })

    const applied = applyProposalsViaCommands([proposal], {
      projectRef: 'proj_demo',
      intent: 'feature',
      goal: 'Add App shell',
    })

    expect(applied).toHaveLength(1)
    expect(applied[0].workspaceCommand.type).toBe('ModifyWorkspace')
    expect(applied[0].platformCommand.kind).toBe('workspace.modify')
    expect(applied[0].platformCommand.projectRef).toBe('proj_demo')
    const payload = applied[0].platformCommand.payload as { mutations: { files: unknown[] } }
    expect(payload.mutations.files).toHaveLength(1)
  })

  it('rejects path traversal in proposals', () => {
    expect(() =>
      createMutationProposal({
        commandId: createCommandId(),
        baseSnapshotId: EMPTY_SNAPSHOT_ID,
        files: [{ kind: 'upsert', path: '../secret.env', content: 'x' }],
      }),
    ).toThrow(/Rejected path/i)
  })

  it('startAgentTurn queues Commands and emits CommandQueued', () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.subscribe('CommandQueued', (e) => seen.push(e.type))

    const proposal = createMutationProposal({
      commandId: createCommandId(),
      baseSnapshotId: EMPTY_SNAPSHOT_ID,
      files: [{ kind: 'upsert', path: 'README.md', content: '# Hi' }],
    })

    const result = startAgentTurn(
      {
        projectRef: 'proj_demo',
        goal: 'Scaffold readme',
        proposals: [proposal],
        intent: 'scaffold',
      },
      { bus },
    )

    expect(result.status).toBe('completed')
    expect(result.commands).toHaveLength(1)
    expect(result.commands[0].kind).toBe('workspace.generate')
    expect(seen).toEqual(['CommandQueued'])
    expect(hasVendorBranding(result.summary)).toBe(false)
  })

  it('startAgentTurn awaits execution when no proposals', () => {
    const result = startAgentTurn({
      projectRef: 'proj_demo',
      goal: 'Plan only',
    })
    expect(result.status).toBe('awaiting_execution')
    expect(result.commands).toHaveLength(0)
  })

  it('sessionToAgentContext builds Indobase generation context', () => {
    const ctx = sessionToAgentContext({
      email: 'op@indobase.in',
      projectRef: 'proj_abc',
      projectName: 'Demo',
      orgSlug: 'acme',
      backend: {
        api_url: 'https://proj_abc.indobase.in',
        anon_key: 'anon_test',
      },
    })

    expect(ctx.schemaVersion).toBe(1)
    expect(ctx.projectRef).toBe('proj_abc')
    expect(ctx.dataPlane?.url).toBe('https://proj_abc.indobase.in')
    expect(ctx.generation.projectRef).toBe('proj_abc')
    expect(hasVendorBranding(ctx.agentHint)).toBe(false)
    expect(ctx.agentHint).toContain('Indobase Builder')
    expect(ctx.agentHint).toMatch(/Design/)
    expect(ctx.agentHint).toMatch(/format\.design/)
    expect(ctx.agentHint).not.toMatch(/Cloudflare/i)
  })

  it('createCloudflareOsAdapter exposes the Phase 1 surface', () => {
    const adapter = createCloudflareOsAdapter({ indobaseProxyPath: '/api/indobase/proxy/' })
    expect(adapter.publicLabel('deploy')).toBe('Publish')
    const ctx = adapter.sessionToAgentContext({
      email: 'a@b.c',
      projectRef: 'ref1',
    })
    expect(ctx.indobaseProxyPath).toBe('/api/indobase/proxy/')
    const prompt = adapter.formatAgentSessionPrompt(ctx)
    expect(prompt).toContain('indobase_builder_session')
    expect(hasVendorBranding(prompt)).toBe(false)
  })
})
