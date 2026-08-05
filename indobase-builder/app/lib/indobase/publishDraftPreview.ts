import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import { collectBuildArtifactsViaServer } from '~/lib/indobase/requestServerBuild';
import { validateGeneratedProjectContract } from '~/lib/indobase/generation-contract';
import { normalizeProjectFilesRoot } from '~/lib/indobase/normalize-project-files';
import {
  setDraftPreviewBuilding,
  setDraftPreviewError,
  setDraftPreviewReady,
} from '~/lib/stores/draft-preview';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import { buildService, workspaceService } from '~/lib/workspace';
import { canQueueIndobaseDeployment } from '~/lib/indobase/studioApi';
import { ExecutionCommands, createExecutionRequest, toExecutionResult } from '~/lib/platform';
import { extractRelativePath } from '~/utils/diff';
import { WORK_DIR } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('publishDraftPreview');

export type PublishDraftPreviewResult = {
  error?: string;
  previewUrl?: string;
  success: boolean;
  /** OS Execution result for build+preview (optional observability). */
  execution?: ReturnType<typeof toExecutionResult>;
};

function collectWorkbenchSourceFiles(): Record<string, string> {
  const projectFiles: Record<string, string> = {};

  for (const [filePath, dirent] of Object.entries(workbenchStore.files.get())) {
    if (dirent?.type !== 'file' || dirent.isBinary) {
      continue;
    }

    const relativePath = extractRelativePath(filePath);

    if (relativePath && !relativePath.startsWith('node_modules/')) {
      projectFiles[relativePath] = dirent.content;
    }
  }

  return projectFiles;
}

/** Relative project files → FileMap keys under WORK_DIR for the server-build API. */
function relativeFilesToFileMap(files: Record<string, string>): FileMap {
  const map: FileMap = {};

  for (const [relativePath, content] of Object.entries(files)) {
    if (!relativePath || relativePath.includes('..')) {
      continue;
    }

    map[`${WORK_DIR}/${relativePath}`] = {
      type: 'file',
      content,
      isBinary: false,
    };
  }

  return map;
}

/**
 * Server-build the current workbench and host a short-lived draft preview on Builder.
 * Does not publish to the project's live subdomain (avoids stomping production).
 */
export async function publishDraftPreview(
  connection?: IndobaseConnectionState | null,
): Promise<PublishDraftPreviewResult> {
  /*
   * These bailouts used to return silently, leaving the preview panel on its resting "Preview will
   * appear here" copy — indistinguishable from "nothing has been built yet". Publish the reason to
   * the store so the panel can explain itself.
   */
  if (!canQueueIndobaseDeployment(connection) || !connection) {
    const error = 'Studio-linked session required for server draft preview';
    setDraftPreviewError(error);

    return { success: false, error };
  }

  const rawFiles = collectWorkbenchSourceFiles();
  const { files: sourceFiles, flattened, rootPrefix } = normalizeProjectFilesRoot(rawFiles);
  const contract = validateGeneratedProjectContract(sourceFiles);

  if (!contract.valid) {
    const error = `Project incomplete for draft preview:\n${contract.issues.join('\n')}`;
    setDraftPreviewError(error);

    return { success: false, error };
  }

  if (flattened) {
    logger.info(`Flattened nested project root "${rootPrefix}" for draft preview`);
  }

  setDraftPreviewBuilding('draft');

  const snapshotId = workspaceService.headSnapshotId.get();
  const buildId = buildService.startBuild(snapshotId);
  const projectRef =
    connection.indobase?.projectRef || connection.selectedProjectId || 'unknown';

  // OS Execution envelopes — adapters below (server-build + draft-preview host) stay unchanged.
  const buildCommand = ExecutionCommands.build(projectRef, 'draft_preview');
  const previewCommand = ExecutionCommands.preview(projectRef, 'draft_preview');
  const buildExecution = createExecutionRequest({
    kind: 'execution.build',
    projectRef,
    reason: 'draft_preview',
    commandId: buildCommand.id,
  });
  const previewExecution = createExecutionRequest({
    kind: 'execution.preview',
    projectRef,
    reason: 'draft_preview',
    commandId: previewCommand.id,
  });

  try {
    const buildResult = await collectBuildArtifactsViaServer(connection, relativeFilesToFileMap(sourceFiles), {
      // Relative base so draft iframe under /draft-preview/:id/ resolves assets.
      assetBase: './',
    });

    if (!buildResult.success || !buildResult.files) {
      const error = buildResult.error || 'Server build failed for draft preview';
      buildService.finishBuild(buildId, { status: 'failed', error });
      setDraftPreviewError(error);
      toExecutionResult(buildExecution, { ok: false, error });

      return { success: false, error, execution: toExecutionResult(previewExecution, { ok: false, error }) };
    }

    toExecutionResult(buildExecution, { ok: true });

    const response = await fetch(
      '/api/indobase/draft-preview',
      getBuilderRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: buildResult.files }),
      }),
    );

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      expiresAt?: number;
      previewUrl?: string;
      success?: boolean;
    };

    if (!response.ok || !payload.success || !payload.previewUrl) {
      const error = payload.error || `Draft preview store failed (${response.status})`;
      buildService.finishBuild(buildId, { status: 'failed', error });
      setDraftPreviewError(error);

      return {
        success: false,
        error,
        execution: toExecutionResult(previewExecution, { ok: false, error }),
      };
    }

    buildService.finishBuild(buildId, { status: 'succeeded', outputRef: payload.previewUrl });
    setDraftPreviewReady(payload.previewUrl, payload.expiresAt, {
      snapshotId,
      buildId,
      backend: 'draft',
    });
    logger.info(`Draft preview ready at ${payload.previewUrl}`);

    return {
      success: true,
      previewUrl: payload.previewUrl,
      execution: toExecutionResult(previewExecution, { ok: true, outputRef: payload.previewUrl }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Draft preview failed';
    buildService.finishBuild(buildId, { status: 'failed', error: message });
    setDraftPreviewError(message);
    logger.error('Draft preview failed', error);

    return {
      success: false,
      error: message,
      execution: toExecutionResult(previewExecution, { ok: false, error: message }),
    };
  }
}
