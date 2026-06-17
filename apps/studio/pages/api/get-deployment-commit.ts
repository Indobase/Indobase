import { NextApiRequest, NextApiResponse } from 'next'

async function getCommitTime(commitSha: string) {
  try {
    const response = await fetch(`https://github.com/Indobase/supabase/commit/${commitSha}.json`, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch commit details')
    }

    const data = await response.json()
    return new Date(data.payload.commit.committedDate).toISOString()
  } catch (error) {
    console.error('Error fetching commit time:', error)
    return 'unknown'
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ commitSha: string; commitTime: string }>
) {
  // Set cache control headers for 10 minutes so that we don't get banned by GitHub API
  res.setHeader('Cache-Control', 's-maxage=600')

  const commitSha =
    process.env.BUILD_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    'development'

  const commitTime =
    commitSha && commitSha !== 'development' && commitSha !== 'unknown'
      ? await getCommitTime(commitSha)
      : 'unknown'

  res.status(200).json({
    commitSha,
    commitTime,
  })
}
