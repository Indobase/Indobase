/**
 * Commit workbench FileMap / working-command proposals through Gen 3 Commands.
 * Used by commitWorkbenchFiles when BUILDER_GEN3_COMMANDS is enabled.
 */

import type { FileMap } from '~/lib/stores/files';
import { createScopedLogger } from '~/utils/logger';
import { applyProposalsViaWorkspace, type ApplyProposalsViaWorkspaceResult } from './gen3-apply';
import { resolveGen3ProjectRef } from './gen3-project-ref';
import { diffTrees, fileMapToTree } from './snapshot-tree';
import type { CommandIntent, CommandReason, CommandScope, WorkspaceCommandType } from './types';
import { workspaceService } from './workspace-service';

const logger = createScopedLogger('gen3-commit');

export type CommitWorkbenchFilesViaGen3Options = {
  files?: FileMap;
  type?: WorkspaceCommandType;
  intent?: CommandIntent;
  scope?: CommandScope;
  reason?: CommandReason;
  goal?: string;
  projectRef?: string;
  /** Optional live Studio project lookup (injected so unit tests stay store-free). */
  resolveLiveProjectRef?: () => string | undefined;
};

/**
 * Prefer accumulated working-command proposals; otherwise diff FileMap vs HEAD.
 * Always maps through applyProposalsViaCommands before Workspace commit.
 */
export async function commitWorkbenchFilesViaGen3(
  options: CommitWorkbenchFilesViaGen3Options = {},
): Promise<ApplyProposalsViaWorkspaceResult> {
  const projectRef = resolveGen3ProjectRef(options.projectRef, options.resolveLiveProjectRef);
  const working = workspaceService.getWorkingCommand();

  if (working && working.proposalCount > 0) {
    const baseTree = workspaceService.materialize(working.baseSnapshotId);
    const mutations = diffTrees(baseTree, working.workingTree);

    // Release session before commit so we do not double-clear after success.
    workspaceService.clearWorkingCommand(working.commandId);

    if (mutations.files.length === 0) {
      logger.info('Gen3 commit skipped — working command had no net mutations');

      return {
        ok: false,
        error: 'No file mutations to apply',
        applied: [],
        platformCommands: [],
        platformEvents: [],
      };
    }

    return applyProposalsViaWorkspace({
      mutations,
      projectRef,
      commandId: working.commandId,
      baseSnapshotId: working.baseSnapshotId,
      type: options.type ?? working.type,
      intent: options.intent ?? working.intent,
      scope: options.scope ?? working.scope,
      reason: options.reason ?? working.reason,
      goal: options.goal ?? working.goal,
    });
  }

  if (working && working.proposalCount === 0) {
    workspaceService.abandonWorkingCommand(working.commandId, 'no proposals');
  }

  const files = options.files;

  if (!files) {
    return {
      ok: false,
      error: 'No working proposals and no files to commit',
      applied: [],
      platformCommands: [],
      platformEvents: [],
    };
  }

  const before = workspaceService.materialize();
  const after = fileMapToTree(files);
  const mutations = diffTrees(before, after);

  if (mutations.files.length === 0) {
    return {
      ok: false,
      error: 'No file mutations to apply',
      applied: [],
      platformCommands: [],
      platformEvents: [],
    };
  }

  return applyProposalsViaWorkspace({
    mutations,
    projectRef,
    type: options.type ?? 'ModifyWorkspace',
    intent: options.intent ?? 'feature',
    scope: options.scope ?? 'workspace',
    reason: options.reason ?? 'user',
    goal: options.goal,
  });
}
