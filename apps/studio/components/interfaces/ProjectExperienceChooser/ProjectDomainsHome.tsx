'use client'

import { useEffect } from 'react'

import { useParams } from 'common'

import { useDomainsLaunch } from './useDomainsLaunch'

/**
 * Studio deep-link shim — redirects to the standalone Domains product at domains.indobase.in.
 */
export const ProjectDomainsHome = () => {
  const { ref } = useParams()
  const { launch, isLaunching } = useDomainsLaunch({ projectRef: ref })

  useEffect(() => {
    void (async () => {
      const result = await launch()
      if (result.ok && result.url) {
        window.location.assign(result.url)
      }
    })()
  }, [launch])

  return (
    <div className="mx-auto flex min-h-[40vh] w-full max-w-lg flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-foreground-light">
        {isLaunching ? 'Opening Domains…' : 'Redirecting to Domains…'}
      </p>
    </div>
  )
}
