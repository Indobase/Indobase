import { afterEach, describe, expect, it } from 'vitest';
import { createEventBus, EMPTY_SNAPSHOT_ID } from '@indobase/platform';
import { applyProposalsViaWorkspace } from './gen3-apply';
import { commitWorkbenchFilesViaGen3 } from './gen3-commit';
import { isBuilderGen3CommandsEnabled, setBuilderGen3CommandsEnabledForTests } from './gen3-flag';
import { GEN3_LOCAL_PROJECT_REF, resolveGen3ProjectRef } from './gen3-project-ref';
import { diffTrees } from './snapshot-tree';
import { WorkspaceService, workspaceService } from './workspace-service';

describe('Gen3 Commands apply path', () => {
  let workspace: WorkspaceService;

  afterEach(() => {
    workspace?.reset();
    workspaceService.reset();
    setBuilderGen3CommandsEnabledForTests(undefined);
  });

  it('isBuilderGen3CommandsEnabled defaults off and respects test override', () => {
    setBuilderGen3CommandsEnabledForTests(false);
    expect(isBuilderGen3CommandsEnabled()).toBe(false);
    setBuilderGen3CommandsEnabledForTests(true);
    expect(isBuilderGen3CommandsEnabled()).toBe(true);
  });

  it('resolveGen3ProjectRef prefers explicit then fallback then local sentinel', () => {
    expect(resolveGen3ProjectRef('  proj_x  ')).toBe('proj_x');
    expect(resolveGen3ProjectRef(undefined, () => 'proj_y')).toBe('proj_y');
    expect(resolveGen3ProjectRef()).toBe(GEN3_LOCAL_PROJECT_REF);
  });

  it('applyProposalsViaWorkspace maps via adapter then commits WorkspaceCommitted', async () => {
    workspace = new WorkspaceService();
    const domainEvents: string[] = [];
    const platformTypes: string[] = [];
    const bus = createEventBus();

    workspace.events.subscribe((e) => domainEvents.push(e.type));
    bus.subscribe('*', (e) => platformTypes.push(e.type));

    const result = await applyProposalsViaWorkspace({
      workspace,
      platformBus: bus,
      projectRef: 'proj_gen3',
      intent: 'scaffold',
      type: 'GenerateProject',
      goal: 'Todo shell',
      mutations: {
        files: [
          { kind: 'upsert', path: 'package.json', content: '{"name":"app"}' },
          { kind: 'upsert', path: 'src/App.tsx', content: 'export const App = () => null' },
        ],
      },
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.snapshot.version).toBe(1);
    expect(result.snapshot.parentId).toBe(EMPTY_SNAPSHOT_ID);
    expect(result.applied).toHaveLength(1);
    expect(result.platformCommands[0].kind).toBe('workspace.generate');
    expect(result.platformCommands[0].projectRef).toBe('proj_gen3');

    const tree = workspace.materialize();
    expect(tree['package.json']?.content).toBe('{"name":"app"}');
    expect(tree['src/App.tsx']?.content).toContain('App');

    expect(domainEvents).toEqual(['CommandQueued', 'CommandStarted', 'WorkspaceCommitted']);
    expect(platformTypes).toContain('CommandQueued');
    expect(platformTypes).toContain('CommandStarted');
    expect(platformTypes).toContain('WorkspaceCommitted');
  });

  it('reuses a working command id without double CommandQueued', async () => {
    workspace = new WorkspaceService();
    const domainEvents: string[] = [];
    workspace.events.subscribe((e) => domainEvents.push(e.type));

    const session = workspace.beginWorkingCommand({
      type: 'ModifyWorkspace',
      intent: 'feature',
      scope: 'multi-file',
      reason: 'user',
      goal: 'edit',
    });

    workspace.proposeFileMutation({
      kind: 'upsert',
      path: 'src/main.ts',
      content: 'console.log(1)',
    });

    const baseTree = workspace.materialize(session.baseSnapshotId);
    const working = workspace.getWorkingCommand(session.commandId)!;
    const mutations = diffTrees(baseTree, working.workingTree);
    workspace.clearWorkingCommand(session.commandId);

    const result = await applyProposalsViaWorkspace({
      workspace,
      projectRef: 'proj_reuse',
      commandId: session.commandId,
      baseSnapshotId: session.baseSnapshotId,
      mutations,
      intent: 'feature',
    });

    expect(result.ok).toBe(true);
    expect(domainEvents.filter((t) => t === 'CommandQueued')).toHaveLength(1);
    expect(domainEvents.filter((t) => t === 'WorkspaceCommitted')).toHaveLength(1);
    expect(workspace.materialize()['src/main.ts']?.content).toBe('console.log(1)');
  });

  it('rejects path traversal before durable commit', async () => {
    workspace = new WorkspaceService();
    const result = await applyProposalsViaWorkspace({
      workspace,
      projectRef: 'proj_x',
      mutations: {
        files: [{ kind: 'upsert', path: '../secret.env', content: 'x' }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/path/i);
    expect(workspace.headSnapshotId.get()).toBe(EMPTY_SNAPSHOT_ID);
  });

  it('commitWorkbenchFilesViaGen3 commits working proposals through the adapter', async () => {
    workspaceService.reset();
    const events: string[] = [];
    workspaceService.events.subscribe((e) => events.push(e.type));

    const session = workspaceService.beginWorkingCommand({
      type: 'ModifyWorkspace',
      intent: 'feature',
      scope: 'multi-file',
      reason: 'user',
      goal: 'via gen3 commit',
    });

    workspaceService.proposeFileMutation({
      kind: 'upsert',
      path: 'hello.ts',
      content: 'export const hello = 1',
    });

    const result = await commitWorkbenchFilesViaGen3({
      projectRef: 'proj_commit',
      type: 'ModifyWorkspace',
      intent: 'feature',
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.applied[0]?.platformCommand.kind).toBe('workspace.modify');
    expect(result.platformCommands[0]?.projectRef).toBe('proj_commit');
    expect(result.snapshot.mutations.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'upsert', path: 'hello.ts' })]),
    );
    expect(events).toContain('WorkspaceCommitted');
    expect(workspaceService.getWorkingCommand(session.commandId)).toBeUndefined();
  });
});
