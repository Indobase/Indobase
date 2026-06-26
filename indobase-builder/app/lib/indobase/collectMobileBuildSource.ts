import { extractRelativePath } from '~/utils/diff';
import { workbenchStore } from '~/lib/stores/workbench';

export type CollectMobileBuildSourceResult =
  | {
      error: string;
      files?: undefined;
      isExpo: false;
      success: false;
    }
  | {
      error?: undefined;
      files: Record<string, string>;
      isExpo: true;
      success: true;
    };

function isExpoPackageJson(packageJson: string) {
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...parsed.dependencies,
      ...parsed.devDependencies,
    };

    return Boolean(dependencies.expo || dependencies['expo-router'] || dependencies['@expo/metro-runtime']);
  } catch {
    return false;
  }
}

export function detectExpoProject(files: Record<string, string>) {
  if (files['app.json'] || files['app.config.js'] || files['app.config.ts'] || files['app.config.mjs']) {
    return true;
  }

  const packageJson = files['package.json'];

  return packageJson ? isExpoPackageJson(packageJson) : false;
}

export function collectMobileBuildSourceFromWorkbench(): CollectMobileBuildSourceResult {
  const files = workbenchStore.files.get();
  const sourceFiles: Record<string, string> = {};

  for (const [filePath, dirent] of Object.entries(files)) {
    if (dirent?.type !== 'file' || dirent.isBinary) {
      continue;
    }

    const relativePath = extractRelativePath(filePath);

    if (!relativePath || relativePath.startsWith('node_modules/')) {
      continue;
    }

    sourceFiles[relativePath] = dirent.content;
  }

  if (!Object.keys(sourceFiles).length) {
    return {
      success: false,
      isExpo: false,
      error: 'No project files found in the workbench. Generate an Expo app before queueing an Android bundle.',
    };
  }

  if (!detectExpoProject(sourceFiles)) {
    return {
      success: false,
      isExpo: false,
      error:
        'Android bundle builds require an Expo project. Use the Expo starter template or add expo to package.json.',
    };
  }

  return {
    success: true,
    isExpo: true,
    files: sourceFiles,
  };
}
