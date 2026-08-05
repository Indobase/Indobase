import { describe, expect, it } from 'vitest';
import { diffTrees, fileMapToTree, materializeSnapshot, normalizeProjectPath } from './snapshot-tree';
import { createCommandId, createSnapshotId, EMPTY_SNAPSHOT_ID } from './ids';
import type { WorkspaceSnapshot } from './types';

describe('snapshot-tree', () => {
  it('normalizes workbench paths', () => {
    expect(normalizeProjectPath('/home/project/src/App.tsx')).toBe('src/App.tsx');
    expect(normalizeProjectPath('//src//App.tsx')).toBe('src/App.tsx');
  });

  it('diffs trees into upsert/delete mutations', () => {
    const before = { 'a.ts': { content: '1', isBinary: false }, 'b.ts': { content: 'b', isBinary: false } };
    const after = { 'a.ts': { content: '2', isBinary: false }, 'c.ts': { content: 'c', isBinary: false } };

    expect(diffTrees(before, after)).toEqual({
      files: [
        { kind: 'upsert', path: 'a.ts', content: '2', isBinary: false },
        { kind: 'delete', path: 'b.ts' },
        { kind: 'upsert', path: 'c.ts', content: 'c', isBinary: false },
      ],
    });
  });

  it('materializes a chain of delta snapshots', () => {
    const snap1Id = createSnapshotId();
    const snap2Id = createSnapshotId();
    const cmd = createCommandId();

    const snapshots = new Map<string, WorkspaceSnapshot>([
      [
        snap1Id,
        {
          id: snap1Id,
          parentId: EMPTY_SNAPSHOT_ID,
          commandId: cmd,
          mutations: {
            files: [
              { kind: 'upsert', path: 'a.ts', content: 'a1' },
              { kind: 'upsert', path: 'b.ts', content: 'b1' },
            ],
          },
          createdAt: 1,
          version: 1,
        },
      ],
      [
        snap2Id,
        {
          id: snap2Id,
          parentId: snap1Id,
          commandId: cmd,
          mutations: {
            files: [
              { kind: 'upsert', path: 'a.ts', content: 'a2' },
              { kind: 'delete', path: 'b.ts' },
            ],
          },
          createdAt: 2,
          version: 2,
        },
      ],
    ]);

    const tree = materializeSnapshot(snap2Id, snapshots as never);
    expect(tree).toEqual({
      'a.ts': { content: 'a2', isBinary: false },
    });
  });

  it('converts FileMap into a relative tree', () => {
    const tree = fileMapToTree({
      '/home/project/src/App.tsx': { type: 'file', content: 'x', isBinary: false },
      '/home/project/src': { type: 'folder' },
    });

    expect(tree).toEqual({
      'src/App.tsx': { content: 'x', isBinary: false },
    });
  });
});
