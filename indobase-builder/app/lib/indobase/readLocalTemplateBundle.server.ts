import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type LocalTemplateFile = {
  name: string;
  path: string;
  content: string;
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const BUILDER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function getLocalTemplatesRoot() {
  return path.join(BUILDER_ROOT, 'templates');
}

export async function readLocalTemplateBundle(bundleId: string): Promise<LocalTemplateFile[]> {
  const bundleRoot = path.join(getLocalTemplatesRoot(), bundleId);
  const files: LocalTemplateFile[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      const relativePath = path.relative(bundleRoot, absolutePath).replace(/\\/g, '/');
      const content = await fs.readFile(absolutePath, 'utf-8');

      files.push({
        name: entry.name,
        path: relativePath,
        content,
      });
    }
  }

  await walk(bundleRoot);

  return files.sort((left, right) => left.path.localeCompare(right.path));
}
