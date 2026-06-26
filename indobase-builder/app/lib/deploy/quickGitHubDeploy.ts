import { Octokit } from '@octokit/rest';

import { getLocalStorage } from '~/lib/persistence/localStorage';
import { resolveGitHubRepoName, sanitizeGitHubRepoName } from '~/lib/deploy/githubRepoName';

export type QuickGitHubDeployResult = {
  error?: string;
  repoUrl?: string;
  success: boolean;
};

async function pushFilesToGitHubRepo(opts: {
  files: Record<string, string>;
  isPrivate?: boolean;
  owner: string;
  repoName: string;
  token: string;
}) {
  const octokit = new Octokit({ auth: opts.token });
  const repoName = sanitizeGitHubRepoName(opts.repoName);
  const isPrivate = opts.isPrivate ?? false;

  let repoExists = false;

  try {
    const { data: existingRepo } = await octokit.repos.get({
      owner: opts.owner,
      repo: repoName,
    });
    repoExists = true;

    if (existingRepo.private !== isPrivate) {
      await octokit.repos.update({
        owner: opts.owner,
        repo: repoName,
        private: isPrivate,
      });
    }
  } catch (error: unknown) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status: number }).status : null;

    if (status !== 404) {
      throw error;
    }
  }

  if (!repoExists) {
    await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: isPrivate,
      auto_init: true,
      gitignore_template: 'Node',
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const { data: repo } = await octokit.repos.get({
    owner: opts.owner,
    repo: repoName,
  });
  const defaultBranch = repo.default_branch || 'main';

  let baseTreeSha: string | null = null;
  let parentCommitSha: string | null = null;

  try {
    const { data: refData } = await octokit.git.getRef({
      owner: opts.owner,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
    });
    parentCommitSha = refData.object.sha;

    const { data: commitData } = await octokit.git.getCommit({
      owner: opts.owner,
      repo: repoName,
      commit_sha: parentCommitSha,
    });
    baseTreeSha = commitData.tree.sha;
  } catch {
    baseTreeSha = null;
    parentCommitSha = null;
  }

  const tree = Object.entries(opts.files).map(([filePath, content]) => ({
    path: filePath,
    mode: '100644' as const,
    type: 'blob' as const,
    content,
  }));

  const { data: treeData } = await octokit.git.createTree({
    owner: opts.owner,
    repo: repoName,
    tree,
    base_tree: baseTreeSha || undefined,
  });

  const { data: commitData } = await octokit.git.createCommit({
    owner: opts.owner,
    repo: repoName,
    message: repoExists ? 'Update from Indobase Builder' : 'Initial commit from Indobase Builder',
    tree: treeData.sha,
    parents: parentCommitSha ? [parentCommitSha] : [],
  });

  try {
    await octokit.git.updateRef({
      owner: opts.owner,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
      sha: commitData.sha,
      force: true,
    });
  } catch {
    await octokit.git.createRef({
      owner: opts.owner,
      repo: repoName,
      ref: `refs/heads/${defaultBranch}`,
      sha: commitData.sha,
    });
  }

  return `https://github.com/${opts.owner}/${repoName}`;
}

export async function quickGitHubDeploy(opts: {
  chatId?: string | null;
  files: Record<string, string>;
  isPrivate?: boolean;
  projectName: string;
}): Promise<QuickGitHubDeployResult> {
  const connection = getLocalStorage('github_connection');

  if (!connection?.token || !connection?.user?.login) {
    return {
      success: false,
      error: 'Connect GitHub in Settings → Connections first.',
    };
  }

  const repoName = resolveGitHubRepoName(opts.projectName, opts.chatId);

  try {
    const repoUrl = await pushFilesToGitHubRepo({
      files: opts.files,
      isPrivate: opts.isPrivate,
      owner: connection.user.login,
      repoName,
      token: connection.token,
    });

    if (opts.chatId) {
      localStorage.setItem(
        `github-repo-${opts.chatId}`,
        JSON.stringify({
          owner: connection.user.login,
          name: repoName,
          url: repoUrl,
        }),
      );
    }

    return {
      success: true,
      repoUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'GitHub deploy failed',
    };
  }
}
