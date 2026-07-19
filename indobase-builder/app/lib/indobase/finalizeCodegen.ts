import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { ensureProjectScaffold } from '~/lib/indobase/ensureProjectScaffold';
import { webcontainer } from '~/lib/webcontainer';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';
import { assertGeneratedSourcesValid, verifyViteSourceTransforms } from './generated-code-validation';

const logger = createScopedLogger('finalizeCodegen');

async function packageHasDevScript(): Promise<boolean> {
  try {
    const container = await webcontainer;
    const raw = await container.fs.readFile('package.json', 'utf-8');
    const packageJson = JSON.parse(raw) as { scripts?: { dev?: string } };

    return Boolean(packageJson.scripts?.dev);
  } catch {
    return false;
  }
}

async function packageUsesVite(): Promise<boolean> {
  try {
    const container = await webcontainer;
    const raw = await container.fs.readFile('package.json', 'utf-8');
    const packageJson = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return Boolean(
      packageJson.dependencies?.vite ||
        packageJson.devDependencies?.vite ||
        Object.values(packageJson.scripts ?? {}).some((script) => /\bvite\b/.test(script)),
    );
  } catch {
    return false;
  }
}

async function nodeModulesPresent(): Promise<boolean> {
  try {
    const container = await webcontainer;
    const entries = await container.fs.readdir('node_modules');

    return entries.length > 0;
  } catch {
    return false;
  }
}

function hasInFlightStart(): boolean {
  const artifact = workbenchStore.firstArtifact;

  if (!artifact) {
    return false;
  }

  return Object.values(artifact.runner.actions.get()).some(
    (action) => action.type === 'start' && (action.status === 'pending' || action.status === 'running'),
  );
}

async function runArtifactAction(action: ActionCallbackData['action'], actionIdPrefix: string): Promise<void> {
  const artifact = workbenchStore.firstArtifact;

  if (!artifact) {
    return;
  }

  const actionId = `${actionIdPrefix}-${Date.now()}`;
  const actionData: ActionCallbackData = {
    messageId: 'post-codegen-ensure-preview',
    artifactId: artifact.id,
    actionId,
    action,
  };

  artifact.runner.addAction(actionData);
  await artifact.runner.runAction(actionData);
}

/**
 * If the model wrote files + npm install but omitted (or dropped) the start action, still boot the
 * preview so one-shot builds do not end on "No preview available".
 */
async function ensureDevServerIfNeeded(): Promise<void> {
  const previews = workbenchStore.previews.get();

  if (previews.some((preview) => preview.ready)) {
    return;
  }

  if (!workbenchStore.firstArtifact) {
    return;
  }

  if (!(await packageHasDevScript())) {
    return;
  }

  // A start action is already queued/running — let waitForPreviewLoaded observe it.
  if (hasInFlightStart()) {
    return;
  }

  try {
    if (!(await nodeModulesPresent())) {
      logger.info('No node_modules found after codegen; running npm install before preview start');
      await runArtifactAction({ type: 'shell', content: 'npm install' }, 'ensure-install');
    }

    logger.info('No preview yet after codegen; starting npm run dev');
    await runArtifactAction({ type: 'start', content: 'npm run dev' }, 'ensure-dev');
  } catch (error) {
    logger.warn('Failed to ensure preview start after codegen', error);
    throw error;
  }
}

/**
 * Flush streamed actions, scaffold static HTML projects, ensure the dev server is running, and wait
 * until the generated app has actually loaded in the WebContainer preview iframe.
 */
export async function finalizeCodegen(): Promise<{ scaffolded: boolean; previewUrl: string }> {
  await workbenchStore.flushPendingActions();

  const scaffolded = await ensureProjectScaffold();
  const container = await webcontainer;
  const generatedSources = await assertGeneratedSourcesValid(
    container.fs as Parameters<typeof assertGeneratedSourcesValid>[0],
  );
  await ensureDevServerIfNeeded();

  workbenchStore.refreshAllPreviews();

  const preview = await workbenchStore.waitForPreviewLoaded();

  if (await packageUsesVite()) {
    await verifyViteSourceTransforms(preview.baseUrl, Object.keys(generatedSources));
  }

  /*
   * The iframe loaded and every generated source passed Vite's transform endpoint, so an earlier
   * "Dev Server Failed" alert is now stale and can be cleared safely.
   */
  workbenchStore.clearAlert();

  return { scaffolded, previewUrl: preview.baseUrl };
}
