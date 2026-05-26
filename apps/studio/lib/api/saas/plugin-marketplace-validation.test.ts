import { Buffer } from 'node:buffer'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  parseGitHubRepoUrl,
  validatePluginSource,
} from './plugin-marketplace-validation'

function githubFileResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(content, 'utf8').toString('base64'),
    }),
  }
}

describe('plugin-marketplace-validation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses public GitHub repository URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/Indobase/indobase-cursor-plugin.git')).toEqual({
      owner: 'Indobase',
      repo: 'indobase-cursor-plugin',
      branch: undefined,
    })

    expect(
      parseGitHubRepoUrl('https://github.com/Indobase/indobase-cursor-plugin/tree/main')
    ).toEqual({
      owner: 'Indobase',
      repo: 'indobase-cursor-plugin',
      branch: 'main',
    })
  })

  it('validates mcp endpoint listings without a repository', async () => {
    const result = await validatePluginSource({
      packageType: 'mcp_server',
      sourceType: 'mcp_endpoint',
      defaultMcpUrl: 'https://mcp.indobase.in?features=account',
    })

    expect(result.validationStatus).toBe('valid')
    expect(result.derivedInstall.defaultMcpUrl).toBe('https://mcp.indobase.in?features=account')
    expect(result.errors).toHaveLength(0)
  })

  it('validates a GitHub-backed cursor plugin package', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === 'https://api.github.com/repos/Indobase/indobase-cursor-plugin') {
        return {
          ok: true,
          json: async () => ({
            default_branch: 'main',
            description: 'OAuth-first Indobase plugin',
            homepage: 'https://indobase.in',
            html_url: 'https://github.com/Indobase/indobase-cursor-plugin',
          }),
        }
      }

      if (
        input ===
        'https://api.github.com/repos/Indobase/indobase-cursor-plugin/git/trees/main?recursive=1'
      ) {
        return {
          ok: true,
          json: async () => ({
            tree: [
              { path: '.cursor-plugin/plugin.json', type: 'blob' },
              { path: '.mcp.json', type: 'blob' },
              { path: 'README.md', type: 'blob' },
              { path: 'LICENSE', type: 'blob' },
              { path: 'skills/indobase-project-builder/SKILL.md', type: 'blob' },
              { path: 'commands/build-with-indobase.md', type: 'blob' },
            ],
          }),
        }
      }

      if (
        input ===
        'https://api.github.com/repos/Indobase/indobase-cursor-plugin/contents/.cursor-plugin/plugin.json?ref=main'
      ) {
        return githubFileResponse(
          JSON.stringify({
            name: 'indobase',
            description: 'Connect Indobase to Cursor.',
            skills: 'skills',
            commands: 'commands',
            mcpServers: '.mcp.json',
          })
        )
      }

      if (
        input ===
        'https://api.github.com/repos/Indobase/indobase-cursor-plugin/contents/skills/indobase-project-builder/SKILL.md?ref=main'
      ) {
        return githubFileResponse(`---
name: indobase-project-builder
description: Build with Indobase
---

# Indobase Project Builder`)
      }

      if (
        input ===
        'https://api.github.com/repos/Indobase/indobase-cursor-plugin/contents/commands/build-with-indobase.md?ref=main'
      ) {
        return githubFileResponse(`---
name: build-with-indobase
description: Build using Indobase
---

Build with Indobase`)
      }

      if (
        input ===
        'https://api.github.com/repos/Indobase/indobase-cursor-plugin/contents/.mcp.json?ref=main'
      ) {
        return githubFileResponse(
          JSON.stringify({
            mcpServers: {
              indobase: {
                url: 'https://mcp.indobase.in?features=account,database',
              },
            },
          })
        )
      }

      throw new Error(`Unexpected fetch URL: ${input}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await validatePluginSource({
      packageType: 'cursor_plugin',
      sourceType: 'github_repo',
      repoUrl: 'https://github.com/Indobase/indobase-cursor-plugin',
    })

    expect(result.validationStatus).toBe('valid')
    expect(result.errors).toHaveLength(0)
    expect(result.derivedInstall.defaultMcpServerName).toBe('indobase')
    expect(result.derivedInstall.defaultMcpUrl).toBe(
      'https://mcp.indobase.in?features=account,database'
    )
    expect(result.packageFiles).toContain('.cursor-plugin/plugin.json')
  })
})
