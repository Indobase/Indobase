export const COMMON_BUILD_OUTPUT_DIRS = ['dist', 'build', 'out', 'output', '.next', 'public'] as const;

export type BuildOutputDir = (typeof COMMON_BUILD_OUTPUT_DIRS)[number];

export async function findFirstExistingBuildOutputDir(
  exists: (relativeDir: string) => Promise<boolean>,
  preferredDir?: string,
): Promise<string | null> {
  const candidates = preferredDir
    ? [preferredDir.replace(/^\/+/, ''), ...COMMON_BUILD_OUTPUT_DIRS.filter((dir) => dir !== preferredDir)]
    : [...COMMON_BUILD_OUTPUT_DIRS];

  for (const dir of candidates) {
    if (await exists(dir)) {
      return dir;
    }
  }

  return null;
}

export async function ensureIndexHtmlInArtifacts(
  files: Record<string, string>,
  readCandidate: (name: string) => Promise<string | null>,
): Promise<Record<string, string>> {
  if (files['index.html']) {
    return files;
  }

  for (const candidate of ['login.html', 'signup.html']) {
    if (files[candidate]) {
      return { ...files, 'index.html': files[candidate] };
    }

    const content = await readCandidate(candidate);

    if (content) {
      return { ...files, 'index.html': content };
    }
  }

  return files;
}
