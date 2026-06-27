import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import { workbenchStore } from '~/lib/stores/workbench';
import { path } from '~/utils/path';
import { formatBuildFailureOutput } from '~/components/deploy/deployUtils';

export type CollectBuildArtifactsResult = {
  error?: string;
  files?: Record<string, string>;
  success: boolean;
};

const COMMON_OUTPUT_DIRS = ['/dist', '/build', '/out', '/output', '/.next', '/public'];

async function getAllFiles(dirPath: string, outputRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await dirPath
    ? (await webcontainer).fs.readdir(dirPath, { withFileTypes: true })
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
  const artifact = workbenchStore.firstArtifact;

  if (!artifact) {
    return {
      success: false,
      error: 'No active project found',
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

  const outputRoot = await resolveBuildOutputPath(buildOutput.path);

  if (!outputRoot) {
    return {
      success: false,
      error: 'Could not find build output directory. Check your build configuration.',
    };
  }

  const files = await getAllFiles(outputRoot, outputRoot);

  if (!files['index.html']) {
    return {
      success: false,
      error: 'Build output must include index.html',
    };
  }

  return {
    success: true,
    files,
  };
}
