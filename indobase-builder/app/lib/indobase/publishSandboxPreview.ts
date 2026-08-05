import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import { validateGeneratedProjectContract } from '~/lib/indobase/generation-contract';
import { normalizeProjectFilesRoot } from '~/lib/indobase/normalize-project-files';
import { publishDraftPreview } from '~/lib/indobase/publishDraftPreview';
import {
  setDraftPreviewBuilding,
  setDraftPreviewError,
  setDraftPreviewReady,
} from '~/lib/stores/draft-preview';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { workbenchStore } from '~/lib/stores/workbench';
import {
  buildService,
  commitWorkbenchFiles,
  inferCodegenCommandMeta,
  workspaceService,
} from '~/lib/workspace';
import { canQueueIndobaseDeployment } from '~/lib/indobase/studioApi';
import { ExecutionCommands, createExecutionRequest, toExecutionResult } from '~/lib/platform';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('publishHostedPreview');

export type PublishSandboxPreviewResult = {
  error?: string;
  previewUrl?: string;
  success: boolean;
  backend?: 'sandbox' | 'draft';
  snapshotId?: string;
  execution?: ReturnType<typeof toExecutionResult>;
};

function materializeSnapshotFiles(snapshotId: string): Record<string, string> {
  const tree = workspaceService.materialize(snapshotId as never);
  const files: Record<string, string> = {};

  for (const [relativePath, entry] of Object.entries(tree)) {
    if (!entry || entry.isBinary || relativePath.startsWith('node_modules/')) {
      continue;
    }

    files[relativePath] = entry.content;
  }

  return files;
}

/**
 * Hosted preview build execution from a Workspace Snapshot.
 * Falls back to static draft preview if the hosted build fails.
 */
export async function publishSandboxPreview(
  connection?: IndobaseConnectionState | null,
): Promise<PublishSandboxPreviewResult> {
  if (!canQueueIndobaseDeployment(connection) || !connection) {
    const error = 'Studio-linked session required for preview';
    setDraftPreviewError(error);

    return { success: false, error };
  }

  const commit = await commitWorkbenchFiles({
    files: workbenchStore.files.get(),
    ...inferCodegenCommandMeta({ isInitialBuild: false, scaffolded: false }),
  });

  const snapshotId = commit.ok ? commit.snapshot.id : workspaceService.headSnapshotId.get();

  if (!snapshotId) {
    const error = 'No workspace snapshot available for preview';
    setDraftPreviewError(error);

    return { success: false, error };
  }

  if (!commit.ok) {
    logger.warn(`Preview commit soft-failed (${commit.error}) — using head snapshot ${snapshotId}`);
  }

  const rawFiles = materializeSnapshotFiles(String(snapshotId));
  const { files: sourceFiles, flattened, rootPrefix } = normalizeProjectFilesRoot(rawFiles);
  const contract = validateGeneratedProjectContract(sourceFiles);

  if (!contract.valid) {
    const error = `Project incomplete for preview:\n${contract.issues.join('\n')}`;
    setDraftPreviewError(error);

    return { success: false, error };
  }

  if (flattened) {
    logger.info(`Flattened nested project root "${rootPrefix}" for hosted preview`);
  }

  setDraftPreviewBuilding('sandbox');

  const buildId = buildService.startBuild(snapshotId as never);
  const projectRef = connection.indobase?.projectRef || connection.selectedProjectId || 'unknown';
  const buildCommand = ExecutionCommands.build(projectRef, 'hosted_preview');
  const previewCommand = ExecutionCommands.preview(projectRef, 'hosted_preview');
  const buildExecution = createExecutionRequest({
    kind: 'execution.build',
    projectRef,
    reason: 'hosted_preview',
    commandId: buildCommand.id,
  });
  const previewExecution = createExecutionRequest({
    kind: 'execution.preview',
    projectRef,
    reason: 'hosted_preview',
    commandId: previewCommand.id,
  });

  try {
    const response = await fetch(
      '/api/indobase/sandbox-preview',
      getBuilderRequestInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: sourceFiles,
          snapshotId: String(snapshotId),
        }),
      }),
    );

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      expiresAt?: number;
      previewUrl?: string;
      success?: boolean;
      hasViteProxy?: boolean;
    };

    if (response.ok && payload.success && payload.previewUrl) {
      toExecutionResult(buildExecution, { ok: true });
      buildService.finishBuild(buildId, { status: 'succeeded', outputRef: payload.previewUrl });
      setDraftPreviewReady(payload.previewUrl, payload.expiresAt, {
        snapshotId: snapshotId as never,
        buildId,
        backend: 'sandbox',
      });
      logger.info(
        `Hosted preview ready at ${payload.previewUrl} (snapshot=${snapshotId}, vite=${Boolean(payload.hasViteProxy)})`,
      );

      return {
        success: true,
        previewUrl: payload.previewUrl,
        backend: 'sandbox',
        snapshotId: String(snapshotId),
        execution: toExecutionResult(previewExecution, { ok: true, outputRef: payload.previewUrl }),
      };
    }

    const hostedError = payload.error || `Hosted preview failed (${response.status})`;
    toExecutionResult(buildExecution, { ok: false, error: hostedError });
    logger.warn(`Hosted preview failed — falling back to draft: ${hostedError}`);
    buildService.finishBuild(buildId, { status: 'failed', error: hostedError });

    const draft = await publishDraftPreview(connection);

    if (draft.success && draft.previewUrl) {
      return {
        success: true,
        previewUrl: draft.previewUrl,
        backend: 'draft',
        snapshotId: String(snapshotId),
        execution: toExecutionResult(previewExecution, { ok: true, outputRef: draft.previewUrl }),
      };
    }

    const error = draft.error || hostedError;
    setDraftPreviewError(error);

    return {
      success: false,
      error,
      snapshotId: String(snapshotId),
      execution: toExecutionResult(previewExecution, { ok: false, error }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hosted preview failed';
    toExecutionResult(buildExecution, { ok: false, error: message });
    buildService.finishBuild(buildId, { status: 'failed', error: message });
    logger.warn(`Hosted preview threw — falling back to draft: ${message}`);

    const draft = await publishDraftPreview(connection);

    if (draft.success && draft.previewUrl) {
      return {
        success: true,
        previewUrl: draft.previewUrl,
        backend: 'draft',
        snapshotId: String(snapshotId),
      };
    }

    setDraftPreviewError(draft.error || message);

    return { success: false, error: draft.error || message, snapshotId: String(snapshotId) };
  }
}
