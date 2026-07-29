import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'node:fs'

function resolveBuildSha(): string {
  for (const path of ['/app/BUILD_SHA', '/srv/studio/BUILD_SHA']) {
    try {
      const value = fs.readFileSync(path, 'utf8').trim()
      if (value) return value
    } catch {
      // ignore missing file
    }
  }

  return (
    process.env.BUILD_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    'development'
  )
}

function resolveBuildTime(): string | null {
  for (const path of ['/app/BUILD_TIME', '/srv/studio/BUILD_TIME']) {
    try {
      const value = fs.readFileSync(path, 'utf8').trim()
      if (value) return value
    } catch {
      // ignore missing file
    }
  }

  const envValue = process.env.BUILD_TIME?.trim()
  return envValue || null
}

async function getCommitTimeFromGitHub(commitSha: string) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/Indobase/Indobase/commits/${commitSha}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`GitHub commit lookup failed (${response.status})`)
    }

    const data = (await response.json()) as {
      commit?: { committer?: { date?: string } }
    }

    const committedDate = data.commit?.committer?.date
    return committedDate ? new Date(committedDate).toISOString() : 'unknown'
  } catch (error) {
    console.error('Error fetching commit time:', error)
    return 'unknown'
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ commitSha: string; commitTime: string }>
) {
  res.setHeader('Cache-Control', 's-maxage=600')

  const commitSha = resolveBuildSha()
  const buildTime = resolveBuildTime()

  let commitTime = 'unknown'

  if (buildTime) {
    commitTime = buildTime
  } else if (commitSha && commitSha !== 'development' && commitSha !== 'unknown') {
    commitTime = await getCommitTimeFromGitHub(commitSha)
  }

  res.status(200).json({
    commitSha,
    commitTime,
  })
}
