import { GitLabApiService } from '~/lib/services/gitlabApiService';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { resolveGitLabRepoName } from '~/lib/deploy/gitlabRepoName';

export type QuickGitLabDeployResult = {
  error?: string;
  repoUrl?: string;
  success: boolean;
};

export async function quickGitLabDeploy(opts: {
  chatId?: string | null;
  files: Record<string, string>;
  isPrivate?: boolean;
  projectName: string;
}): Promise<QuickGitLabDeployResult> {
  const connection = getLocalStorage('gitlab_connection');

  if (!connection?.token || !connection?.user?.username) {
    return {
      success: false,
      error: 'Connect GitLab in Settings → Connections first.',
    };
  }

  const gitlabUrl = connection.gitlabUrl || 'https://gitlab.com';
  const apiService = new GitLabApiService(connection.token, gitlabUrl);
  const repoName = resolveGitLabRepoName(opts.projectName, opts.chatId);
  const isPrivate = opts.isPrivate ?? false;
  const projectPath = `${connection.user.username}/${repoName}`;

  try {
    const existingProject = await apiService.getProjectByPath(projectPath);
    let repoUrl: string;

    if (existingProject) {
      if (existingProject.visibility !== (isPrivate ? 'private' : 'public')) {
        await apiService.updateProjectVisibility(existingProject.id, isPrivate ? 'private' : 'public');
      }

      await apiService.updateProjectWithFiles(existingProject.id, opts.files);
      repoUrl = existingProject.http_url_to_repo;
    } else {
      const newProject = await apiService.createProjectWithFiles(repoName, isPrivate, opts.files);
      repoUrl = newProject.http_url_to_repo;
    }

    if (opts.chatId) {
      localStorage.setItem(
        `gitlab-repo-${opts.chatId}`,
        JSON.stringify({
          owner: connection.user.username,
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
      error: error instanceof Error ? error.message : 'GitLab deploy failed',
    };
  }
}
