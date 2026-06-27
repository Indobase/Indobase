export function sanitizeGitHubRepoName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100) || 'my-project'
  );
}

export function resolveGitHubRepoName(projectName: string, chatId?: string | null) {
  if (chatId) {
    const raw = localStorage.getItem(`github-repo-${chatId}`);

    if (raw) {
      try {
        const saved = JSON.parse(raw) as { name?: string };

        if (saved.name?.trim()) {
          return sanitizeGitHubRepoName(saved.name);
        }
      } catch {
        // ignore invalid cache
      }
    }
  }

  return sanitizeGitHubRepoName(projectName);
}
