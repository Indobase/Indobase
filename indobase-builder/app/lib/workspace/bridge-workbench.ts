import type { FileMap } from '~/lib/stores/files';
import { createScopedLogger } from '~/utils/logger';
import { commandScheduler } from './command-scheduler';
import { diffTrees, fileMapToTree } from './snapshot-tree';
import type { CommandIntent, CommandReason, CommandScope, WorkspaceCommandType } from './types';
import { workspaceService } from './workspace-service';

const logger = createScopedLogger('workspace-bridge');

export type CommitWorkbenchFilesOptions = {
  files?: FileMap;
  type?: WorkspaceCommandType;
  intent?: CommandIntent;
  scope?: CommandScope;
  reason?: CommandReason;
  goal?: string;
};

export type BeginCodegenCommandOptions = {
  type?: WorkspaceCommandType;
  intent?: CommandIntent;
  scope?: CommandScope;
  reason?: CommandReason;
  goal?: string;
};

/**
 * Open a working command for streaming codegen. Subsequent workbench file upserts propose into it.
 * Reuses an existing working session so failed finalize → repair keeps accumulated proposals.
 */
export function beginCodegenCommand(options: BeginCodegenCommandOptions = {}) {
  const existing = workspaceService.getWorkingCommand();

  if (existing) {
    const command = workspaceService.getCommand(existing.commandId);

    if (command) {
      if (options.type) {
        command.type = options.type;
      }

      if (options.intent) {
        command.intent = options.intent;
      }

      if (options.scope) {
        command.scope = options.scope;
      }

      if (options.reason) {
        command.reason = options.reason;
      }

      if (options.goal) {
        command.goal = options.goal;
      }
    }

    if (options.type) {
      existing.type = options.type;
    }

    if (options.intent) {
      existing.intent = options.intent;
    }

    if (options.scope) {
      existing.scope = options.scope;
    }

    if (options.reason) {
      existing.reason = options.reason;
    }

    if (options.goal) {
      existing.goal = options.goal;
    }

    return existing;
  }

  return workspaceService.beginWorkingCommand({
    type: options.type ?? 'ModifyWorkspace',
    intent: options.intent ?? 'feature',
    scope: options.scope ?? 'workspace',
    reason: options.reason ?? 'user',
    goal: options.goal,
  });
}

/** Record a streamed/editor file write as a mutation proposal (not yet committed). */
export function proposeWorkbenchFileWrite(filePath: string, content: string, isBinary = false) {
  return workspaceService.proposeFileMutation({
    kind: 'upsert',
    path: filePath,
    content,
    isBinary,
  });
}

/**
 * Commit the active working command if present; otherwise diff FileMap against HEAD.
 * Prefer proposals accumulated during streaming over a late full-tree diff.
 */
export async function commitWorkbenchFiles(options: CommitWorkbenchFilesOptions = {}) {
  const working = workspaceService.getWorkingCommand();

  if (working && working.proposalCount > 0) {
    const command = workspaceService.getCommand(working.commandId);

    if (command) {
      if (options.type) {
        command.type = options.type;
      }

      if (options.intent) {
        command.intent = options.intent;
      }

      if (options.scope) {
        command.scope = options.scope;
      }

      if (options.reason) {
        command.reason = options.reason;
      }

      if (options.goal) {
        command.goal = options.goal;
      }
    }

    const result = await workspaceService.commitWorkingCommand(working.commandId);

    if (result.ok) {
      logger.info(
        `Working-command commit ${result.snapshot.id} v${result.snapshot.version} (${result.snapshot.mutations.files.length} ops)`,
      );
    } else {
      logger.warn(`Working-command commit failed: ${result.error}`);
    }

    return result;
  }

  if (working && working.proposalCount === 0) {
    workspaceService.abandonWorkingCommand(working.commandId, 'no proposals');
  }

  const type = options.type ?? 'ModifyWorkspace';
  const intent = options.intent ?? 'feature';
  const scope = options.scope ?? 'workspace';
  const reason = options.reason ?? 'user';
  const files = options.files;

  if (!files) {
    return { ok: false as const, error: 'No working proposals and no files to commit' };
  }

  const result = await commandScheduler.enqueue({
    type,
    intent,
    scope,
    reason,
    goal: options.goal,
    plan: () => {
      const before = workspaceService.materialize();
      const after = fileMapToTree(files);

      return diffTrees(before, after);
    },
  });

  if (result.ok) {
    logger.info(
      `Workbench commit ${result.snapshot.id} v${result.snapshot.version} (${result.snapshot.mutations.files.length} ops)`,
    );
  } else {
    logger.warn(`Workbench commit failed: ${result.error}`);
  }

  return result;
}

export function inferCodegenCommandMeta(options: {
  isInitialBuild: boolean;
  scaffolded: boolean;
}): Pick<CommitWorkbenchFilesOptions, 'type' | 'intent' | 'scope' | 'reason'> {
  if (options.isInitialBuild || options.scaffolded) {
    return {
      type: 'GenerateProject',
      intent: 'scaffold',
      scope: 'workspace',
      reason: 'user',
    };
  }

  return {
    type: 'ModifyWorkspace',
    intent: 'feature',
    scope: 'workspace',
    reason: 'user',
  };
}

export function inferRepairCommandMeta(): Pick<
  CommitWorkbenchFilesOptions,
  'type' | 'intent' | 'scope' | 'reason'
> {
  return {
    type: 'ModifyWorkspace',
    intent: 'repair',
    scope: 'multi-file',
    reason: 'diagnostics',
  };
}
