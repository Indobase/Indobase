export function sanitizeGitLabRepoName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function resolveGitLabRepoName(projectName: string, chatId?: string | null) {
  if (chatId) {
    const raw = localStorage.getItem(`gitlab-repo-${chatId}`);

    if (raw) {
      try {
        const saved = JSON.parse(raw) as { name?: string };

        if (saved.name?.trim()) {
          return sanitizeGitLabRepoName(saved.name);
        }
      } catch {
        // ignore invalid cache
      }
    }
  }

  return sanitizeGitLabRepoName(projectName);
}
