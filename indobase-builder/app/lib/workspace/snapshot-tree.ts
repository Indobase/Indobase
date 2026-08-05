import type { FileMap } from '~/lib/stores/files';
import { EMPTY_SNAPSHOT_ID, type SnapshotId } from './ids';
import {
  normalizeProjectPath,
  validateMutationSet,
  type FileMutation,
  type MutationSet,
  type WorkspaceSnapshot,
} from '@indobase/platform';

export { normalizeProjectPath, validateMutationSet };
export type { FileMutation, MutationSet };

export type MaterializedFile = {
  content: string;
  isBinary: boolean;
};

export type MaterializedTree = Record<string, MaterializedFile>;

export function fileMapToTree(files: FileMap): MaterializedTree {
  const tree: MaterializedTree = {};

  for (const [rawPath, entry] of Object.entries(files)) {
    if (!entry || entry.type !== 'file') {
      continue;
    }

    const path = normalizeProjectPath(rawPath);

    if (!path) {
      continue;
    }

    tree[path] = {
      content: entry.content,
      isBinary: Boolean(entry.isBinary),
    };
  }

  return tree;
}

export function diffTrees(before: MaterializedTree, after: MaterializedTree): MutationSet {
  const files: FileMutation[] = [];
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));

  for (const path of afterKeys) {
    const next = after[path]!;
    const prev = before[path];

    if (!prev || prev.content !== next.content || prev.isBinary !== next.isBinary) {
      files.push({
        kind: 'upsert',
        path,
        content: next.content,
        isBinary: next.isBinary,
      });
    }
  }

  for (const path of beforeKeys) {
    if (!afterKeys.has(path)) {
      files.push({ kind: 'delete', path });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return { files };
}

export function applyMutations(tree: MaterializedTree, mutations: MutationSet): MaterializedTree {
  const next: MaterializedTree = { ...tree };

  for (const mutation of mutations.files) {
    if (mutation.kind === 'delete') {
      delete next[mutation.path];
      continue;
    }

    next[mutation.path] = {
      content: mutation.content,
      isBinary: Boolean(mutation.isBinary),
    };
  }

  return next;
}

/**
 * Reconstruct a tree by walking parent → … → snapshot.
 * `snapshotsById` must include every ancestor except the empty root.
 */
export function materializeSnapshot(
  snapshotId: SnapshotId,
  snapshotsById: ReadonlyMap<SnapshotId, WorkspaceSnapshot>,
): MaterializedTree {
  if (snapshotId === EMPTY_SNAPSHOT_ID) {
    return {};
  }

  const chain: WorkspaceSnapshot[] = [];
  let current: SnapshotId | null = snapshotId;

  while (current && current !== EMPTY_SNAPSHOT_ID) {
    const snap = snapshotsById.get(current);

    if (!snap) {
      throw new Error(`Missing snapshot ${current} while materializing ${snapshotId}`);
    }

    chain.push(snap);
    current = snap.parentId;
  }

  chain.reverse();

  let tree: MaterializedTree = {};

  for (const snap of chain) {
    tree = applyMutations(tree, snap.mutations);
  }

  return tree;
}

export function treeToFileMap(tree: MaterializedTree, workdirPrefix = '/home/project'): FileMap {
  const files: FileMap = {};

  for (const [relPath, file] of Object.entries(tree)) {
    files[`${workdirPrefix}/${relPath}`] = {
      type: 'file',
      content: file.content,
      isBinary: file.isBinary,
    };
  }

  return files;
}
