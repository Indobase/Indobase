import { extractRelativePath } from '~/utils/diff';
import { workbenchStore } from '~/lib/stores/workbench';

/**
 * Project source files from the workbench (excludes node_modules and binaries).
 * Used for framework detection on Vercel and similar hosts.
 */
export function collectWorkbenchSourceFiles(): Record<string, string> {
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

  return sourceFiles;
}
