import { extractRelativePath } from '~/utils/diff';
import { normalizeProjectFilesRoot } from '~/lib/indobase/normalize-project-files';
import { workbenchStore } from '~/lib/stores/workbench';

/**
 * Project source files from the workbench (excludes node_modules and binaries).
 * Nested scaffolds are flattened so callers always see a root package.json when one exists.
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

  return normalizeProjectFilesRoot(sourceFiles).files;
}
