import Link from 'next/link'
import { useRouter } from 'next/router'

import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import AlertError from 'components/ui/AlertError'
import { usePluginDetailQuery } from 'data/plugin-marketplace/hooks'
import { Badge } from 'ui'
import { ShimmeringLoader } from 'ui-patterns/ShimmeringLoader'
import { PluginInstallPanel } from './PluginInstallPanel'

export const PluginMarketplaceDetail = () => {
  const router = useRouter()
  const slug = typeof router.query.slug === 'string' ? router.query.slug : undefined
  const { data, error, isPending } = usePluginDetailQuery(slug)

  if (isPending) {
    return (
      <ScaffoldContainer>
        <ScaffoldSection isFullWidth className="space-y-2">
          <ShimmeringLoader />
          <ShimmeringLoader className="w-3/4" />
          <ShimmeringLoader className="w-1/2" />
        </ScaffoldSection>
      </ScaffoldContainer>
    )
  }

  if (error || !data) {
    return (
      <ScaffoldContainer>
        <ScaffoldSection isFullWidth>
          <AlertError error={error} subject="Failed to load plugin detail" />
        </ScaffoldSection>
      </ScaffoldContainer>
    )
  }

  const { listing, versions } = data
  const latestVersion = versions[0]

  return (
    <ScaffoldContainer>
      <ScaffoldSection isFullWidth className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p>{listing.name}</p>
              <Badge variant="default">{listing.packageType}</Badge>
              <Badge variant="default">{listing.reviewStatus}</Badge>
            </div>
            <p className="text-sm text-foreground-light">{listing.summary}</p>
            <div className="flex flex-wrap gap-2">
              {listing.categories.map((category) => (
                <Badge key={category.slug} variant="default">
                  {category.name}
                </Badge>
              ))}
            </div>
          </div>
          <Link href={`/org/${listing.organizationSlug}/plugins`} className="text-sm text-brand">
            Manage publisher view
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-6">
            <div className="rounded border bg-surface-100 p-4">
              <p className="mb-2 text-sm text-foreground">Description</p>
              <div className="whitespace-pre-wrap text-sm text-foreground-light">
                {listing.descriptionMd || 'No description provided.'}
              </div>
            </div>

            <div className="rounded border bg-surface-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-foreground">Versions</p>
                <p className="text-xs text-foreground-light">{versions.length} total</p>
              </div>
              <div className="space-y-3">
                {versions.map((version) => (
                  <div key={version.id} className="rounded border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{version.version}</p>
                        <p className="text-xs text-foreground-light">
                          {version.reviewStatus} · {version.validationStatus}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="default">{version.reviewStatus}</Badge>
                        <Badge
                          variant={version.validationStatus === 'valid' ? 'success' : 'warning'}
                        >
                          {version.validationStatus}
                        </Badge>
                      </div>
                    </div>
                    {version.changelog && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-light">
                        {version.changelog}
                      </p>
                    )}
                    {version.validationErrors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {version.validationErrors.map((entry) => (
                          <p key={entry} className="text-sm text-red-900">
                            {entry}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded border bg-surface-100 p-4">
              <p className="mb-2 text-sm text-foreground">Listing metadata</p>
              <div className="space-y-2 text-sm text-foreground-light">
                <p>Publisher: {listing.organizationName}</p>
                <p>Latest version: {listing.latestVersion ?? 'n/a'}</p>
                <p>Published version: {listing.publishedVersion ?? 'n/a'}</p>
                <p>Repo: {listing.repoUrl ?? 'Not linked'}</p>
                <p>MCP URL: {listing.defaultMcpUrl ?? 'Not configured'}</p>
                <p>Install count: {listing.installCount}</p>
              </div>
            </div>

            <PluginInstallPanel listing={listing} />

            {latestVersion?.validationWarnings.length > 0 && (
              <div className="rounded border bg-surface-100 p-4">
                <p className="mb-2 text-sm text-foreground">Validation warnings</p>
                <div className="space-y-1">
                  {latestVersion.validationWarnings.map((warning) => (
                    <p key={warning} className="text-sm text-yellow-1100">
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScaffoldSection>
    </ScaffoldContainer>
  )
}
