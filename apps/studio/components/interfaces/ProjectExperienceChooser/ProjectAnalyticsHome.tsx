import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import { BarChart3, ExternalLink, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'common'

import { Badge, Button, cn } from 'ui'
import { Admonition } from 'ui-patterns/admonition'

import { useAnalyticsLaunch, type AnalyticsMapping } from './useAnalyticsLaunch'

/**
 * Indobase Analytics hub — project ↔ site mapping + Open Analytics (Studio SSO).
 */
export const ProjectAnalyticsHome = () => {
  const { ref } = useParams()
  const { launch, isLaunching } = useAnalyticsLaunch()
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchDenied, setLaunchDenied] = useState(false)
  const [mapping, setMapping] = useState<AnalyticsMapping | null>(null)

  const openAnalytics = async (mode: 'same-tab' | 'new-tab') => {
    setLaunchError(null)
    setLaunchDenied(false)
    const result = await launch()
    if (!result.ok) {
      if (result.denied) {
        setLaunchDenied(true)
        setLaunchError(result.message)
        return
      }
      setLaunchError(result.message || 'Could not start Indobase Analytics session')
      return
    }
    if (result.mapping) setMapping(result.mapping)
    if (mode === 'new-tab') {
      window.open(result.url, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.assign(result.url)
  }

  const previewMapping: AnalyticsMapping = mapping || {
    project_ref: ref || '',
    project_name: ref || '',
    site_domain: `${ref || 'your-ref'}.indobase.in`,
    analytics_base_url:
      typeof window !== 'undefined' && window.location.hostname.includes('indobase.fun')
        ? 'https://analytics.indobase.fun'
        : 'https://analytics.indobase.in',
    snippet: `<script src="https://analytics.indobase.in/api/script.js" data-site-id="SITE_ID" defer></script>`,
    note: 'SITE_ID is created on first Open Analytics.',
  }

  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[320px] bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(139,92,246,0.14)_0%,transparent_60%)]"
      />

      <ScaffoldContainer size="large">
        <ScaffoldSection isFullWidth className="py-10 md:py-14">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
            <div className="space-y-3">
              <Badge variant="default">Indobase Analytics</Badge>
              <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
                Product analytics for this project
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-foreground-light md:text-base">
                Privacy-friendly pageviews, sessions, funnels, and goals — opened with your Studio
                login. Each Indobase project maps to one Analytics site (created on first launch).
              </p>
            </div>

            {launchError ? (
              <Admonition
                type={launchDenied ? 'warning' : 'danger'}
                title={launchDenied ? 'Access needed' : 'Could not open Analytics'}
              >
                {launchError}
              </Admonition>
            ) : null}

            <div className="rounded-2xl border bg-surface-100 p-6 md:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  <div className="rounded-xl bg-[#8B5CF6]/10 p-3">
                    <BarChart3 size={24} strokeWidth={1.75} className="text-[#8B5CF6]" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-medium">Project ↔ site</h2>
                    <p className="text-sm text-foreground-light">
                      Project <code className="text-xs">{previewMapping.project_ref}</code> → site
                      domain <code className="text-xs">{previewMapping.site_domain}</code>
                    </p>
                    <p className="text-xs text-foreground-lighter">
                      Tag <code>ib-project:{previewMapping.project_ref}</code> on the Analytics site
                      keeps the mapping stable across opens.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="primary"
                    size="small"
                    disabled={isLaunching}
                    onClick={() => void openAnalytics('same-tab')}
                  >
                    {isLaunching ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Opening…
                      </span>
                    ) : (
                      'Open Analytics'
                    )}
                  </Button>
                  <Button
                    type="default"
                    size="small"
                    disabled={isLaunching}
                    icon={<ExternalLink size={14} />}
                    onClick={() => void openAnalytics('new-tab')}
                  >
                    New tab
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border bg-surface-100 p-6 md:p-7">
              <h2 className="text-lg font-medium">Tracking snippet</h2>
              <p className="text-sm text-foreground-light">
                Add this to tenant apps or Builder-published sites (replace{' '}
                <code className="text-xs">SITE_ID</code> with the numeric site id from the Analytics
                dashboard URL after first launch).
              </p>
              <pre
                className={cn(
                  'overflow-x-auto rounded-lg border bg-surface-200 p-4 text-xs leading-relaxed text-foreground'
                )}
              >
                {previewMapping.snippet}
              </pre>
              <p className="text-xs text-foreground-lighter">
                Script URL host must match your environment (
                <code>analytics.indobase.fun</code> staging / <code>analytics.indobase.in</code>{' '}
                production). Session replay and advanced flags are configured per-site in Analytics.
              </p>
            </div>
          </div>
        </ScaffoldSection>
      </ScaffoldContainer>
    </div>
  )
}
