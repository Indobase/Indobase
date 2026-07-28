import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import { collectBuildArtifactsViaServer } from '~/lib/indobase/requestServerBuild';
import { validateGeneratedProjectContract } from '~/lib/indobase/generation-contract';
import {
  setDraftPreviewBuilding,
  setDraftPreviewError,
  setDraftPreviewReady,
} from '~/lib/stores/draft-preview';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { workbenchStore } from '~/lib/stores/workbench';
import { canQueueIndobaseDeployment } from '~/lib/indobase/studioApi';
import { extractRelativePath } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('publishDraftPreview');

export type PublishDraftPreviewResult = {
  error?: string;
  previewUrl?: string;
  success: boolean;
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

/**
 * Server-build the current workbench and host a short-lived draft preview on Builder.
 * Does not publish to the project's live subdomain (avoids stomping production).
 */
export async function publishDraftPreview(
  connection?: IndobaseConnectionState | null,
): Promise<PublishDraftPreviewResult> {
  if (!canQueueIndobaseDeployment(connection) || !connection) {
    return {
      success: false,
      error: 'Studio-linked session required for server draft preview',
    };
  }

  const sourceFiles = collectWorkbenchSourceFiles();
  const contract = validateGeneratedProjectContract(sourceFiles);

  if (!contract.valid) {
    return {
      success: false,
      error: `Project incomplete for draft preview:\n${contract.issues.join('\n')}`,
    };
  }

  setDraftPreviewBuilding();

  try {
    const buildResult = await collectBuildArtifactsViaServer(connection, workbenchStore.files.get(), {
      // Relative base so draft iframe under /draft-preview/:id/ resolves assets.
      assetBase: './',
    });

    if (!buildResult.success || !buildResult.files) {
      const error = buildResult.error || 'Server build failed for draft preview';
      setDraftPreviewError(error);

      return { success: false, error };
    }

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
      setDraftPreviewError(error);

      return { success: false, error };
    }

    setDraftPreviewReady(payload.previewUrl, payload.expiresAt);
    logger.info(`Draft preview ready at ${payload.previewUrl}`);

    return { success: true, previewUrl: payload.previewUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Draft preview failed';
    setDraftPreviewError(message);
    logger.error('Draft preview failed', error);

    return { success: false, error: message };
  }
}
