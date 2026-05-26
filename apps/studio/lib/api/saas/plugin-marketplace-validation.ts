import { Buffer } from 'node:buffer'

export type PluginPackageType = 'cursor_plugin' | 'mcp_server'
export type PluginSourceType = 'github_repo' | 'manifest_url' | 'mcp_endpoint'

export type ValidatedPluginSource = {
  validationStatus: 'valid' | 'invalid'
  errors: string[]
  warnings: string[]
  manifestJson: Record<string, unknown> | null
  packageFiles: string[]
  packageMetadata: Record<string, unknown>
  derivedInstall: {
    defaultMcpServerName?: string | null
    defaultMcpUrl?: string | null
    manifestPath?: string | null
    mcpPath?: string | null
    readmePath?: string | null
  }
}

type ValidatePluginSourceOptions = {
  packageType: PluginPackageType
  sourceType: PluginSourceType
  repoUrl?: string | null
  manifestPath?: string | null
  mcpPath?: string | null
  defaultMcpUrl?: string | null
}

type GitHubRepoRef = {
  owner: string
  repo: string
  branch?: string
}

type GitHubRepoMetadata = {
  defaultBranch: string
  description: string | null
  htmlUrl: string
  homepage: string | null
  treePaths: string[]
}

function normalizeRepoPath(path: string | null | undefined, fallback: string) {
  const trimmed = (path ?? '').trim()
  const normalized = trimmed || fallback
  if (normalized.startsWith('/')) return normalized.slice(1)
  if (normalized.startsWith('./')) return normalized.slice(2)
  return normalized
}

function isSafeRelativePath(path: string) {
  return !path.startsWith('/') && !path.includes('..')
}

function looksLikeDirectoryPath(path: string) {
  return path.endsWith('/')
}

function hasYamlFrontmatter(text: string, requiredKeys: string[]) {
  if (!text.startsWith('---\n')) return false
  const end = text.indexOf('\n---', 4)
  if (end === -1) return false
  const frontmatter = text.slice(4, end)
  return requiredKeys.every((key) => new RegExp(`^${key}:`, 'm').test(frontmatter))
}

export function parseGitHubRepoUrl(raw: string): GitHubRepoRef | null {
  try {
    const url = new URL(raw)
    if (url.hostname !== 'github.com') return null
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (parts.length < 2) return null
    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/, '')
    if (!owner || !repo) return null
    const isTree = parts[2] === 'tree' && parts[3]
    return {
      owner,
      repo,
      branch: isTree ? decodeURIComponent(parts[3]) : undefined,
    }
  } catch {
    return null
  }
}

async function fetchGitHubApiJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'indobase-plugin-marketplace',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${url}`)
  }
  return (await response.json()) as T
}

async function fetchGitHubRepoMetadata(repo: GitHubRepoRef): Promise<GitHubRepoMetadata> {
  const repoMeta = await fetchGitHubApiJson<{
    default_branch: string
    description: string | null
    homepage: string | null
    html_url: string
  }>(`https://api.github.com/repos/${repo.owner}/${repo.repo}`)

  const ref = repo.branch || repoMeta.default_branch
  const tree = await fetchGitHubApiJson<{
    tree: Array<{ path: string; type: string }>
  }>(`https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)

  return {
    defaultBranch: ref,
    description: repoMeta.description,
    htmlUrl: repoMeta.html_url,
    homepage: repoMeta.homepage,
    treePaths: tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path),
  }
}

async function fetchGitHubFileText(repo: GitHubRepoRef, ref: string, path: string): Promise<string> {
  const response = await fetchGitHubApiJson<{
    content?: string
    encoding?: string
    type?: string
  }>(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?ref=${encodeURIComponent(ref)}`
  )

  if (response.type !== 'file' || !response.content || response.encoding !== 'base64') {
    throw new Error(`GitHub contents API returned non-file content for ${path}`)
  }

  return Buffer.from(response.content, 'base64').toString('utf8')
}

function pathExistsInTree(treePaths: string[], path: string) {
  const normalized = path.replace(/^\.\/+/, '').replace(/^\/+/, '')
  if (!normalized) return false
  if (treePaths.includes(normalized)) return true
  const prefix = looksLikeDirectoryPath(normalized) ? normalized : `${normalized}/`
  return treePaths.some((entry) => entry.startsWith(prefix))
}

function firstExistingPath(treePaths: string[], candidates: string[]) {
  return candidates.find((candidate) => pathExistsInTree(treePaths, candidate)) ?? null
}

function isValidUrl(value: string | null | undefined) {
  if (!value?.trim()) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function coerceObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function deriveRemoteMcpInstall(config: Record<string, unknown>) {
  const mcpServers = coerceObject(config.mcpServers)
  if (!mcpServers) return { defaultMcpServerName: null, defaultMcpUrl: null }
  const [serverName, serverConfig] = Object.entries(mcpServers)[0] ?? []
  if (!serverName) return { defaultMcpServerName: null, defaultMcpUrl: null }
  const configObject = coerceObject(serverConfig)
  const rawUrl = typeof configObject?.url === 'string' ? configObject.url : null
  return {
    defaultMcpServerName: serverName,
    defaultMcpUrl: rawUrl,
  }
}

async function validateCursorPluginFromGitHub(
  repo: GitHubRepoRef,
  metadata: GitHubRepoMetadata,
  opts: ValidatePluginSourceOptions
): Promise<ValidatedPluginSource> {
  const errors: string[] = []
  const warnings: string[] = []
  const manifestPath = normalizeRepoPath(opts.manifestPath, '.cursor-plugin/plugin.json')
  const mcpPath = normalizeRepoPath(opts.mcpPath, '.mcp.json')
  const readmePath = firstExistingPath(metadata.treePaths, ['README.md', 'Readme.md', 'readme.md'])
  const licensePath = firstExistingPath(metadata.treePaths, ['LICENSE', 'LICENSE.md', 'License.md'])

  if (!isSafeRelativePath(manifestPath)) {
    errors.push('Manifest path must be relative and stay within the repository.')
  }

  if (!pathExistsInTree(metadata.treePaths, manifestPath)) {
    errors.push(`Missing manifest file at ${manifestPath}.`)
  }

  if (!readmePath) warnings.push('README.md is missing.')
  if (!licensePath) warnings.push('LICENSE is missing.')

  let manifestJson: Record<string, unknown> | null = null
  let derivedInstall = {
    defaultMcpServerName: null as string | null,
    defaultMcpUrl: null as string | null,
    manifestPath,
    mcpPath: null as string | null,
    readmePath,
  }

  if (errors.length === 0) {
    try {
      manifestJson = JSON.parse(await fetchGitHubFileText(repo, metadata.defaultBranch, manifestPath))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Failed to read plugin manifest.')
    }
  }

  const manifestName =
    manifestJson && typeof manifestJson.name === 'string' ? manifestJson.name.trim() : ''
  if (!manifestName) {
    errors.push('Plugin manifest must include a non-empty `name`.')
  } else if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(manifestName)) {
    errors.push('Plugin manifest `name` must be lowercase kebab-case.')
  }

  const declaredPaths = manifestJson
    ? [
        ['skills', manifestJson.skills],
        ['commands', manifestJson.commands],
        ['rules', manifestJson.rules],
        ['agents', manifestJson.agents],
        ['mcpServers', manifestJson.mcpServers],
        ['hooks', manifestJson.hooks],
      ]
    : []

  for (const [label, value] of declaredPaths) {
    if (typeof value !== 'string') continue
    if (!isSafeRelativePath(value)) {
      errors.push(`Manifest path for ${label} must be relative and stay within the repository.`)
      continue
    }
    if (!pathExistsInTree(metadata.treePaths, normalizeRepoPath(value, value))) {
      errors.push(`Manifest path for ${label} does not exist: ${value}`)
    }
  }

  const skillsPath =
    manifestJson && typeof manifestJson.skills === 'string'
      ? normalizeRepoPath(manifestJson.skills, 'skills/')
      : null
  if (skillsPath && pathExistsInTree(metadata.treePaths, skillsPath)) {
    const skillFiles = metadata.treePaths.filter(
      (entry) => entry.startsWith(skillsPath.replace(/\/?$/, '/')) && entry.endsWith('/SKILL.md')
    )
    if (skillFiles.length === 0) {
      errors.push(`No skill files found under ${skillsPath}`)
    } else {
      for (const file of skillFiles.slice(0, 10)) {
        try {
          const text = await fetchGitHubFileText(repo, metadata.defaultBranch, file)
          if (!hasYamlFrontmatter(text, ['name', 'description'])) {
            errors.push(`Skill file is missing required frontmatter: ${file}`)
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Failed to read ${file}`)
        }
      }
    }
  }

  const commandsPath =
    manifestJson && typeof manifestJson.commands === 'string'
      ? normalizeRepoPath(manifestJson.commands, 'commands/')
      : null
  if (commandsPath && pathExistsInTree(metadata.treePaths, commandsPath)) {
    const commandFiles = metadata.treePaths.filter((entry) => {
      return (
        entry.startsWith(commandsPath.replace(/\/?$/, '/')) &&
        (entry.endsWith('.md') || entry.endsWith('.txt'))
      )
    })
    if (commandFiles.length === 0) {
      errors.push(`No command files found under ${commandsPath}`)
    } else {
      for (const file of commandFiles.slice(0, 10)) {
        try {
          const text = await fetchGitHubFileText(repo, metadata.defaultBranch, file)
          if (!hasYamlFrontmatter(text, ['name', 'description'])) {
            errors.push(`Command file is missing required frontmatter: ${file}`)
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Failed to read ${file}`)
        }
      }
    }
  }

  const declaredMcpPath =
    manifestJson && typeof manifestJson.mcpServers === 'string'
      ? normalizeRepoPath(manifestJson.mcpServers, '.mcp.json')
      : mcpPath

  if (pathExistsInTree(metadata.treePaths, declaredMcpPath)) {
    try {
      const mcpJson = JSON.parse(await fetchGitHubFileText(repo, metadata.defaultBranch, declaredMcpPath))
      const remoteInstall = deriveRemoteMcpInstall(coerceObject(mcpJson) ?? {})
      derivedInstall = {
        ...derivedInstall,
        mcpPath: declaredMcpPath,
        defaultMcpServerName: remoteInstall.defaultMcpServerName,
        defaultMcpUrl: remoteInstall.defaultMcpUrl,
      }
      if (!remoteInstall.defaultMcpUrl) {
        warnings.push(`MCP config exists at ${declaredMcpPath} but does not expose a remote URL.`)
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed to parse ${declaredMcpPath}`)
    }
  } else {
    warnings.push('No .mcp.json was found; install payloads will rely on manual configuration.')
  }

  if (manifestJson && typeof manifestJson.description !== 'string') {
    warnings.push('Plugin manifest does not declare a description.')
  }

  return {
    validationStatus: errors.length === 0 ? 'valid' : 'invalid',
    errors,
    warnings,
    manifestJson,
    packageFiles: metadata.treePaths,
    packageMetadata: {
      sourceType: opts.sourceType,
      packageType: opts.packageType,
      repo: {
        owner: repo.owner,
        repo: repo.repo,
        branch: metadata.defaultBranch,
        htmlUrl: metadata.htmlUrl,
        description: metadata.description,
        homepage: metadata.homepage,
      },
      readmePath,
      licensePath,
      manifestPath,
      mcpPath: derivedInstall.mcpPath,
    },
    derivedInstall,
  }
}

async function validateMcpOnlySource(
  repo: GitHubRepoRef | null,
  metadata: GitHubRepoMetadata | null,
  opts: ValidatePluginSourceOptions
): Promise<ValidatedPluginSource> {
  const errors: string[] = []
  const warnings: string[] = []
  let manifestJson: Record<string, unknown> | null = null
  let derivedInstall = {
    defaultMcpServerName: 'plugin',
    defaultMcpUrl: opts.defaultMcpUrl?.trim() || null,
    manifestPath: null as string | null,
    mcpPath: null as string | null,
    readmePath: firstExistingPath(metadata?.treePaths ?? [], ['README.md', 'Readme.md', 'readme.md']),
  }

  if (opts.sourceType === 'mcp_endpoint') {
    if (!isValidUrl(opts.defaultMcpUrl)) {
      errors.push('A valid default MCP URL is required for mcp_endpoint sources.')
    }
  }

  if (repo && metadata) {
    const mcpPath = normalizeRepoPath(opts.mcpPath, '.mcp.json')
    if (pathExistsInTree(metadata.treePaths, mcpPath)) {
      try {
        const mcpJson = JSON.parse(await fetchGitHubFileText(repo, metadata.defaultBranch, mcpPath))
        const remoteInstall = deriveRemoteMcpInstall(coerceObject(mcpJson) ?? {})
        derivedInstall = {
          ...derivedInstall,
          mcpPath,
          defaultMcpServerName: remoteInstall.defaultMcpServerName || derivedInstall.defaultMcpServerName,
          defaultMcpUrl: remoteInstall.defaultMcpUrl || derivedInstall.defaultMcpUrl,
        }
        manifestJson = coerceObject(mcpJson)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Failed to parse ${mcpPath}`)
      }
    } else if (!derivedInstall.defaultMcpUrl) {
      errors.push(`Missing MCP config at ${mcpPath} and no default MCP URL was supplied.`)
    }
  }

  if (!isValidUrl(derivedInstall.defaultMcpUrl)) {
    errors.push('Unable to derive a valid remote MCP URL for this integration.')
  }

  return {
    validationStatus: errors.length === 0 ? 'valid' : 'invalid',
    errors,
    warnings,
    manifestJson,
    packageFiles: metadata?.treePaths ?? [],
    packageMetadata: {
      sourceType: opts.sourceType,
      packageType: opts.packageType,
      repo: metadata
        ? {
            owner: repo?.owner,
            repo: repo?.repo,
            branch: metadata.defaultBranch,
            htmlUrl: metadata.htmlUrl,
            description: metadata.description,
            homepage: metadata.homepage,
          }
        : null,
    },
    derivedInstall,
  }
}

export async function validatePluginSource(
  opts: ValidatePluginSourceOptions
): Promise<ValidatedPluginSource> {
  if (opts.sourceType === 'manifest_url') {
    return {
      validationStatus: 'invalid',
      errors: ['manifest_url sources are not supported yet. Use a GitHub repository or MCP endpoint.'],
      warnings: [],
      manifestJson: null,
      packageFiles: [],
      packageMetadata: {
        sourceType: opts.sourceType,
        packageType: opts.packageType,
      },
      derivedInstall: {},
    }
  }

  const repo = opts.repoUrl?.trim() ? parseGitHubRepoUrl(opts.repoUrl.trim()) : null
  if (opts.sourceType === 'github_repo' && !repo) {
    return {
      validationStatus: 'invalid',
      errors: ['Only public GitHub repository URLs are supported right now.'],
      warnings: [],
      manifestJson: null,
      packageFiles: [],
      packageMetadata: {
        sourceType: opts.sourceType,
        packageType: opts.packageType,
      },
      derivedInstall: {},
    }
  }

  const metadata = repo ? await fetchGitHubRepoMetadata(repo) : null

  if (opts.packageType === 'cursor_plugin') {
    if (!repo || !metadata) {
      return {
        validationStatus: 'invalid',
        errors: ['Cursor-like plugin packages currently require a public GitHub repository.'],
        warnings: [],
        manifestJson: null,
        packageFiles: [],
        packageMetadata: {
          sourceType: opts.sourceType,
          packageType: opts.packageType,
        },
        derivedInstall: {},
      }
    }
    return validateCursorPluginFromGitHub(repo, metadata, opts)
  }

  return validateMcpOnlySource(repo, metadata, opts)
}
