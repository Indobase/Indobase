import { useRouter } from 'next/router'

import { useParams } from 'common'
import { SupportLink } from 'components/interfaces/Support/SupportLink'
import { useProjectDetailQuery } from 'data/projects/project-detail-query'
import { Button, CriticalIcon } from 'ui'
import { ResponseError } from 'types'

export const ProjectLoadErrorState = () => {
  const router = useRouter()
  const { ref } = useParams()
  const { error, refetch, isFetching } = useProjectDetailQuery({ ref })

  const correlationId =
    error instanceof ResponseError && typeof error.message === 'string'
      ? error.message.match(/Reference ID: ([\w-]+)/i)?.[1]
      : undefined

  const statusCode = error instanceof ResponseError ? error.code : undefined

  return (
    <div className="flex items-center justify-center h-full min-h-[320px] px-6">
      <div className="bg-surface-100 border border-overlay rounded-md w-full max-w-xl">
        <div className="space-y-6 pt-6 pb-8">
          <div className="flex px-8 space-x-4">
            <div className="mt-1 shrink-0">
              <CriticalIcon className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <p className="font-medium">Unable to load this project</p>
              <p className="text-sm text-foreground-light">
                {statusCode === 403 || statusCode === 404
                  ? 'You may not have access to this project, or it may no longer exist.'
                  : 'Studio could not load project details. This is usually temporary — try again in a moment.'}
              </p>
              {correlationId ? (
                <p className="text-xs font-mono text-foreground-lighter">
                  Reference ID: {correlationId}
                </p>
              ) : null}
              <p className="text-sm text-foreground-light">
                If the problem continues, contact{' '}
                <SupportLink className="text-sm">support</SupportLink>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 px-8">
            <Button loading={isFetching} onClick={() => refetch()}>
              Try again
            </Button>
            <Button type="outline" onClick={() => router.push('/organizations')}>
              Back to projects
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
