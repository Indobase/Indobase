import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { finalizeCodegen } from '~/lib/indobase/finalizeCodegen';
import { ensureNpmDependencies } from '~/lib/indobase/ensureNpmDependencies';
import { webcontainer } from '~/lib/webcontainer';
import { workbenchStore } from '~/lib/stores/workbench';
import { path } from '~/utils/path';
import { formatBuildFailureOutput } from '~/components/deploy/deployUtils';
import { COMMON_BUILD_OUTPUT_DIRS } from '~/lib/indobase/buildOutputDirs';

async function ensureStaticPreview(outputRoot: string): Promise<void> {
  const previews = workbenchStore.previews.get();

  if (previews.some((preview) => preview.ready)) {
    return;
  }

  const artifact = workbenchStore.firstArtifact;

  if (!artifact) {
    return;
  }

  const actionId = `preview-${Date.now()}`;
  const actionData: ActionCallbackData = {
    messageId: 'static-preview',
    artifactId: artifact.id,
    actionId,
    action: {
      type: 'start',
      content: `npx --yes serve ${outputRoot} -l 5173`,
    },
  };

  artifact.runner.addAction(actionData);
  await artifact.runner.runAction(actionData);
}

async function ensureIndexHtml(outputRoot: string): Promise<void> {
  const container = await webcontainer;

  try {
    await container.fs.readFile(`${outputRoot}/index.html`, 'utf-8');
    return;
  } catch {
    // continue
  }

  for (const candidate of ['login.html', 'signup.html']) {
    try {
      const content = await container.fs.readFile(`${outputRoot}/${candidate}`, 'utf-8');
      await container.fs.writeFile(`${outputRoot}/index.html`, content);
      return;
    } catch {
      continue;
    }
  }
}

export type CollectBuildArtifactsResult = {
  error?: string;
  files?: Record<string, string>;
  success: boolean;
};

const COMMON_OUTPUT_DIRS = COMMON_BUILD_OUTPUT_DIRS.map((dir) => `/${dir}`);

async function getAllFiles(dirPath: string, outputRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = dirPath
    ? await (await webcontainer).fs.readdir(dirPath, { withFileTypes: true })
    : [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isFile()) {
      try {
        const content = await (await webcontainer).fs.readFile(fullPath, 'utf-8');
        const deployPath = fullPath.replace(outputRoot, '').replace(/^\/+/, '');

        if (deployPath) {
          files[deployPath] = content;
        }
      } catch {
        continue;
      }
    } else if (entry.isDirectory()) {
      Object.assign(files, await getAllFiles(fullPath, outputRoot));
    }
  }

  return files;
}

async function resolveBuildOutputPath(buildPath: string) {
  const normalizedBuildPath = buildPath.replace('/home/project', '');
  const candidates = normalizedBuildPath ? [normalizedBuildPath, ...COMMON_OUTPUT_DIRS] : COMMON_OUTPUT_DIRS;
  const container = await webcontainer;

  for (const dir of candidates) {
    try {
      await container.fs.readdir(dir);
      return dir.endsWith('/') ? dir.slice(0, -1) : dir;
    } catch {
      continue;
    }
  }

  return null;
}

export async function collectBuildArtifacts(): Promise<CollectBuildArtifactsResult> {
  await finalizeCodegen({ isInitialBuild: false });

  const artifact = workbenchStore.firstArtifact;

  if (!artifact) {
    return {
      success: false,
      error: 'No active project found',
    };
  }

  const installResult = await ensureNpmDependencies();

  if (!installResult.success) {
    return {
      success: false,
      error: installResult.error || 'npm install failed before build',
    };
  }

  const actionId = `build-${Date.now()}`;
  const actionData: ActionCallbackData = {
    messageId: 'indobase deploy build',
    artifactId: artifact.id,
    actionId,
    action: {
      type: 'build',
      content: 'npm run build',
    },
  };

  artifact.runner.addAction(actionData);
  await artifact.runner.runAction(actionData);

  const buildOutput = artifact.runner.buildOutput;

  if (!buildOutput || buildOutput.exitCode !== 0) {
    return {
      success: false,
      error: formatBuildFailureOutput(buildOutput?.output),
    };
  }

  // The build itself passed; failures below are Builder-side artifact collection
  // problems and must never be reported to the repair agent as a project build error.
  try {
    const outputRoot = await resolveBuildOutputPath(buildOutput.path);

    if (!outputRoot) {
      return {
        success: false,
        error: 'Could not find build output directory. Check your build configuration.',
      };
    }

    await ensureIndexHtml(outputRoot);
    const files = await getAllFiles(outputRoot, outputRoot);

    if (!files['index.html'] && files['login.html']) {
      files['index.html'] = files['login.html'];
    }

    if (!files['index.html']) {
      return {
        success: false,
        error: 'Build output must include index.html (or login.html copied to dist).',
      };
    }

    try {
      await ensureStaticPreview(outputRoot);
    } catch {
      // Preview is best-effort; publishing must not fail because a preview server did not start.
    }

    return {
      success: true,
      files,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: `The project build succeeded, but Builder could not read the build output (${message}). Re-run the build; do not change project code for this.`,
    };
  }
}
