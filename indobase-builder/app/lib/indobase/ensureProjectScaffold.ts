import type { WebContainer } from '@webcontainer/api';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import { webcontainer } from '~/lib/webcontainer';

const STATIC_PACKAGE_JSON = {
  name: 'indobase-static-site',
  private: true,
  version: '1.0.0',
  scripts: {
    build: 'mkdir -p dist && for f in *.html; do [ -f "$f" ] && cp "$f" dist/; done',
    dev: 'npx --yes serve . -l 5173',
  },
};

async function listHtmlOnDisk(container: WebContainer): Promise<string[]> {
  try {
    const entries = await container.fs.readdir('.', { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.html')).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function listHtmlInWorkbench(): Array<{ relativePath: string; content: string }> {
  const files = workbenchStore.files.get();
  const htmlFiles: Array<{ relativePath: string; content: string }> = [];

  for (const [absolutePath, dirent] of Object.entries(files)) {
    if (dirent?.type !== 'file' || dirent.isBinary || !absolutePath.endsWith('.html')) {
      continue;
    }

    const relativePath = absolutePath.startsWith(`${WORK_DIR}/`)
      ? absolutePath.slice(WORK_DIR.length + 1)
      : absolutePath.replace(/^\/+/, '');

    if (!relativePath || relativePath.includes('/')) {
      continue;
    }

    htmlFiles.push({ relativePath, content: dirent.content });
  }

  return htmlFiles;
}

async function syncWorkbenchHtmlToDisk(container: WebContainer): Promise<void> {
  for (const { relativePath, content } of listHtmlInWorkbench()) {
    try {
      await container.fs.readFile(relativePath, 'utf-8');
    } catch {
      await container.fs.writeFile(relativePath, content);
    }
  }
}

/**
 * When the model only wrote static HTML (no package.json), create a minimal build scaffold
 * so autonomous verification and preview can succeed.
 */
export async function ensureProjectScaffold(): Promise<boolean> {
  const container = await webcontainer;

  try {
    await container.fs.readFile('package.json', 'utf-8');
    return false;
  } catch {
    // continue
  }

  await syncWorkbenchHtmlToDisk(container);

  const htmlOnDisk = await listHtmlOnDisk(container);

  if (htmlOnDisk.length === 0) {
    return false;
  }

  await container.fs.writeFile('package.json', `${JSON.stringify(STATIC_PACKAGE_JSON, null, 2)}\n`);

  return true;
}
