import { afterEach, describe, expect, it } from 'vitest';
import { CommandScheduler } from './command-scheduler';
import { createCommandId, EMPTY_SNAPSHOT_ID } from './ids';
import { materializeSnapshot } from './snapshot-tree';
import { WorkspaceService } from './workspace-service';

describe('WorkspaceService + CommandScheduler', () => {
  let workspace: WorkspaceService;
  let scheduler: CommandScheduler;

  afterEach(() => {
    workspace.reset();
  });

  function setup() {
    workspace = new WorkspaceService();
    scheduler = new CommandScheduler(workspace);

    return { workspace, scheduler };
  }

  it('commits a delta snapshot from a GenerateProject command', async () => {
    const { workspace, scheduler } = setup();
    const events: string[] = [];
    workspace.events.subscribe((e) => events.push(e.type));

    const result = await scheduler.enqueue({
      type: 'GenerateProject',
      intent: 'scaffold',
      scope: 'workspace',
      reason: 'user',
      goal: 'todo app',
      plan: () => ({
        files: [
          { kind: 'upsert', path: 'package.json', content: '{"name":"app"}' },
          { kind: 'upsert', path: 'src/App.tsx', content: 'export const App = () => null' },
        ],
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.snapshot.version).toBe(1);
    expect(result.snapshot.parentId).toBe(EMPTY_SNAPSHOT_ID);
    expect(result.snapshot.mutations.files).toHaveLength(2);
    expect(workspace.headSnapshotId.get()).toBe(result.snapshot.id);

    const tree = workspace.materialize();
    expect(tree['package.json']?.content).toBe('{"name":"app"}');
    expect(tree['src/App.tsx']?.content).toContain('App');

    expect(events).toEqual(['CommandQueued', 'CommandStarted', 'WorkspaceCommitted']);
  });

  it('stores only the mutation set on subsequent commits', async () => {
    const { workspace, scheduler } = setup();

    const first = await scheduler.enqueue({
      type: 'GenerateProject',
      intent: 'scaffold',
      scope: 'workspace',
      reason: 'user',
      plan: () => ({
        files: [
          { kind: 'upsert', path: 'a.ts', content: 'a1' },
          { kind: 'upsert', path: 'b.ts', content: 'b1' },
        ],
      }),
    });

    expect(first.ok).toBe(true);

    const second = await scheduler.enqueue({
      type: 'ModifyWorkspace',
      intent: 'ui',
      scope: 'single-file',
      reason: 'user',
      plan: () => ({
        files: [{ kind: 'upsert', path: 'a.ts', content: 'a2' }],
      }),
    });

    expect(second.ok).toBe(true);

    if (!second.ok || !first.ok) {
      return;
    }

    expect(second.snapshot.mutations.files).toMatchObject([
      { kind: 'upsert', path: 'a.ts', content: 'a2' },
    ]);
    expect(second.snapshot.parentId).toBe(first.snapshot.id);

    const tree = materializeSnapshot(
      second.snapshot.id,
      new Map(workspace.listSnapshots().map((s) => [s.id, s])),
    );
    expect(tree['a.ts']?.content).toBe('a2');
    expect(tree['b.ts']?.content).toBe('b1');
  });

  it('tags repair as ModifyWorkspace with diagnostics reason', async () => {
    const { scheduler } = setup();

    await scheduler.enqueue({
      type: 'GenerateProject',
      intent: 'scaffold',
      scope: 'workspace',
      reason: 'user',
      plan: () => ({ files: [{ kind: 'upsert', path: 'x.ts', content: '1' }] }),
    });

    const repair = await scheduler.enqueue({
      type: 'ModifyWorkspace',
      intent: 'repair',
      scope: 'multi-file',
      reason: 'diagnostics',
      plan: () => ({ files: [{ kind: 'upsert', path: 'x.ts', content: '2' }] }),
    });

    expect(repair.ok).toBe(true);

    if (!repair.ok) {
      return;
    }

    expect(repair.command.type).toBe('ModifyWorkspace');
    expect(repair.command.intent).toBe('repair');
    expect(repair.command.reason).toBe('diagnostics');
  });

  it('rejects invalid paths at the workspace commit gate', async () => {
    const { scheduler } = setup();

    const result = await scheduler.enqueue({
      type: 'ModifyWorkspace',
      intent: 'feature',
      scope: 'single-file',
      reason: 'user',
      plan: () => ({
        files: [{ kind: 'upsert', path: '../outside.ts', content: 'nope' }],
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error).toMatch(/Rejected path/);
    expect(result.command.status).toBe('failed');
  });

  it('allows multiple command ids while serializing mutating plans', async () => {
    const { workspace, scheduler } = setup();
    const order: string[] = [];

    const a = scheduler.enqueue({
      type: 'ModifyWorkspace',
      intent: 'feature',
      scope: 'workspace',
      reason: 'user',
      plan: async () => {
        order.push('plan-a-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('plan-a-end');

        return { files: [{ kind: 'upsert', path: 'a.ts', content: 'a' }] };
      },
    });

    const b = scheduler.enqueue({
      type: 'ModifyWorkspace',
      intent: 'feature',
      scope: 'workspace',
      reason: 'optimization',
      plan: async () => {
        order.push('plan-b-start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('plan-b-end');

        return { files: [{ kind: 'upsert', path: 'b.ts', content: 'b' }] };
      },
    });

    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.ok && rb.ok).toBe(true);
    expect(ra.command.id).not.toBe(rb.command.id);
    expect(order).toEqual(['plan-a-start', 'plan-a-end', 'plan-b-start', 'plan-b-end']);

    const tree = workspace.materialize();
    expect(tree['a.ts']?.content).toBe('a');
    expect(tree['b.ts']?.content).toBe('b');
    expect(workspace.headVersion.get()).toBe(2);
  });

  it('accumulates file proposals then commits a delta snapshot', async () => {
    const { workspace } = setup();
    const session = workspace.beginWorkingCommand({
      type: 'GenerateProject',
      intent: 'scaffold',
      scope: 'workspace',
      reason: 'user',
    });

    expect(workspace.proposeFileMutation({ kind: 'upsert', path: 'a.ts', content: '1' }).ok).toBe(true);
    expect(workspace.proposeFileMutation({ kind: 'upsert', path: 'b.ts', content: '2' }).ok).toBe(true);
    expect(workspace.proposeFileMutation({ kind: 'upsert', path: 'a.ts', content: '1b' }).ok).toBe(true);
    expect(workspace.getWorkingCommand()?.proposalCount).toBe(3);

    const result = await workspace.commitWorkingCommand(session.commandId);
    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.snapshot.mutations.files).toMatchObject([
      { kind: 'upsert', path: 'a.ts', content: '1b' },
      { kind: 'upsert', path: 'b.ts', content: '2' },
    ]);
    expect(workspace.getWorkingCommand()).toBeUndefined();
    expect(workspace.materialize()['a.ts']?.content).toBe('1b');
  });

  it('records versioned diagnostics artifacts without a new snapshot', async () => {
    const { workspace } = setup();

    await new CommandScheduler(workspace).enqueue({
      type: 'GenerateProject',
      intent: 'scaffold',
      scope: 'workspace',
      reason: 'user',
      plan: () => ({ files: [{ kind: 'upsert', path: 'x.ts', content: '1' }] }),
    });

    const snap = workspace.headSnapshotId.get();
    const first = workspace.recordDiagnostics([{ message: 'TS2304', source: 'typescript', filePath: 'x.ts' }]);
    const second = workspace.recordDiagnostics([{ message: 'design', source: 'design', filePath: 'x.ts' }], snap);

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(second.snapshotId).toBe(snap);
    expect(workspace.listDiagnosticsForSnapshot(snap)).toHaveLength(2);
  });

  it('detects conflicts when rebasing onto a moved HEAD', async () => {
    const { workspace } = setup();

    const first = await new CommandScheduler(workspace).enqueue({
      type: 'GenerateProject',
      intent: 'scaffold',
      scope: 'workspace',
      reason: 'user',
      plan: () => ({ files: [{ kind: 'upsert', path: 'shared.ts', content: 'v1' }] }),
    });

    expect(first.ok).toBe(true);

    if (!first.ok) {
      return;
    }

    const conflictCommandId = createCommandId();

    // Simulate concurrent base: command B planned against snap_empty while A already committed.
    workspace.registerCommand({
      id: conflictCommandId,
      type: 'ModifyWorkspace',
      intent: 'feature',
      scope: 'single-file',
      reason: 'user',
      baseSnapshotId: EMPTY_SNAPSHOT_ID,
      status: 'running',
      createdAt: Date.now(),
    });

    const conflict = await workspace.commit({
      commandId: conflictCommandId,
      baseSnapshotId: EMPTY_SNAPSHOT_ID,
      mutations: { files: [{ kind: 'upsert', path: 'shared.ts', content: 'v2' }] },
    });

    expect(conflict.ok).toBe(false);

    if (conflict.ok) {
      return;
    }

    expect(conflict.error).toMatch(/Conflict on shared\.ts/);
  });
});
