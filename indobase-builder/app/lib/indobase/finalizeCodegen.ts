import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { ensureProjectScaffold } from '~/lib/indobase/ensureProjectScaffold';
import { webcontainer } from '~/lib/webcontainer';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('finalizeCodegen');

async function ensureStaticDevServer(): Promise<void> {
  const previews = workbenchStore.previews.get();

  if (previews.some((preview) => preview.ready)) {
    return;
  }

  const artifact = workbenchStore.firstArtifact;

  if (!artifact) {
    return;
  }

  try {
    const container = await webcontainer;
    const raw = await container.fs.readFile('package.json', 'utf-8');
    const packageJson = JSON.parse(raw) as { name?: string; scripts?: { dev?: string } };

    if (packageJson.name !== 'indobase-static-site' || !packageJson.scripts?.dev) {
      return;
    }
  } catch {
    return;
  }

  const actionId = `scaffold-dev-${Date.now()}`;
  const actionData: ActionCallbackData = {
    messageId: 'post-codegen-scaffold',
    artifactId: artifact.id,
    actionId,
    action: {
      type: 'start',
      content: 'npm run dev',
    },
  };

  artifact.runner.addAction(actionData);

  try {
    await artifact.runner.runAction(actionData);
  } catch (error) {
    logger.warn('Failed to start static dev preview after scaffold', error);
  }
}

/**
 * Flush streamed file actions, scaffold static HTML projects, and refresh previews.
 * Runs after each assistant response so preview/publish work without manual steps.
 */
export async function finalizeCodegen(): Promise<{ scaffolded: boolean }> {
  await workbenchStore.flushPendingActions();

  const scaffolded = await ensureProjectScaffold();

  if (scaffolded) {
    await ensureStaticDevServer();
  }

  workbenchStore.refreshAllPreviews();

  return { scaffolded };
}
