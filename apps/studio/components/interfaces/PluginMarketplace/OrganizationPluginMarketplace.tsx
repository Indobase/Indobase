import Link from 'next/link'
import { useState } from 'react'

import { useParams } from 'common'
import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import Table from 'components/to-be-cleaned/Table'
import AlertError from 'components/ui/AlertError'
import { useOrganizationPluginsQuery } from 'data/plugin-marketplace/hooks'
import type { PluginDetail, PluginListing } from 'data/plugin-marketplace/types'
import { Badge, Button } from 'ui'
import { ShimmeringLoader } from 'ui-patterns/ShimmeringLoader'
import { PluginPublishSidePanel } from './PluginPublishSidePanel'
import { PluginVersionSidePanel } from './PluginVersionSidePanel'

function ValidationBadge({ listing }: { listing: PluginListing }) {
  const variant =
    listing.latestValidationStatus === 'valid'
      ? 'success'
      : listing.latestValidationStatus === 'invalid'
        ? 'warning'
        : 'default'
  return <Badge variant={variant as any}>{listing.latestValidationStatus}</Badge>
}

export const OrganizationPluginMarketplace = () => {
  const { slug } = useParams()
  const [showPublishPanel, setShowPublishPanel] = useState(false)
  const [selectedListing, setSelectedListing] = useState<PluginListing>()
  const [selectedForVersion, setSelectedForVersion] = useState<PluginListing>()
  const [lastSavedDetail, setLastSavedDetail] = useState<PluginDetail>()

  const { data = [], error, isPending } = useOrganizationPluginsQuery(slug)

  return (
    <>
      <ScaffoldContainer>
        <ScaffoldSection isFullWidth className="flex flex-col gap-y-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p>Marketplace plugins</p>
              <p className="text-sm text-foreground-light">
                Publish repo-backed plugins and MCP integrations linked to your existing OAuth apps.
              </p>
            </div>
            <Button
              onClick={() => {
                setSelectedListing(undefined)
                setShowPublishPanel(true)
              }}
            >
              Publish plugin
            </Button>
          </div>

          {isPending && (
            <div className="space-y-2">
              <ShimmeringLoader />
              <ShimmeringLoader className="w-3/4" />
            </div>
          )}

          {error && <AlertError error={error} subject="Failed to retrieve marketplace plugins" />}

          {!isPending && !error && data.length === 0 && (
            <div className="rounded border bg-surface-100 p-4 text-sm text-foreground-light">
              No marketplace listings yet. Publish your first plugin from this organization.
            </div>
          )}

          {!isPending && !error && data.length > 0 && (
            <Table
              head={[
                <Table.th key="name">Plugin</Table.th>,
                <Table.th key="status">Review</Table.th>,
                <Table.th key="validation">Validation</Table.th>,
                <Table.th key="version">Latest version</Table.th>,
                <Table.th key="installs">Installs</Table.th>,
                <Table.th key="actions"></Table.th>,
              ]}
              body={data.map((listing) => (
                <Table.tr key={listing.id}>
                  <Table.td>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{listing.name}</p>
                        <Badge variant="default">{listing.packageType}</Badge>
                      </div>
                      <p className="text-sm text-foreground-light">{listing.summary}</p>
                    </div>
                  </Table.td>
                  <Table.td>
                    <Badge variant="default">{listing.reviewStatus}</Badge>
                  </Table.td>
                  <Table.td>
                    <ValidationBadge listing={listing} />
                  </Table.td>
                  <Table.td>
                    <div className="space-y-1">
                      <p>{listing.latestVersion ?? 'No version yet'}</p>
                      <p className="text-xs text-foreground-light">{listing.visibility}</p>
                    </div>
                  </Table.td>
                  <Table.td>{listing.installCount}</Table.td>
                  <Table.td>
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/plugins/${listing.slug}`} className="text-sm text-brand">
                        View
                      </Link>
                      <Button
                        type="default"
                        onClick={() => {
                          setSelectedListing(listing)
                          setShowPublishPanel(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button type="default" onClick={() => setSelectedForVersion(listing)}>
                        New version
                      </Button>
                    </div>
                  </Table.td>
                </Table.tr>
              ))}
            />
          )}

          {lastSavedDetail && (
            <div className="rounded border bg-surface-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground">Last validation result</p>
                  <p className="text-xs text-foreground-light">
                    {lastSavedDetail.listing.name} · {lastSavedDetail.versions[0]?.version}
                  </p>
                </div>
                <ValidationBadge listing={lastSavedDetail.listing} />
              </div>
              {lastSavedDetail.versions[0]?.validationErrors.length ? (
                <div className="mt-3 space-y-1">
                  {lastSavedDetail.versions[0].validationErrors.map((error) => (
                    <p key={error} className="text-sm text-red-900">
                      {error}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-foreground-light">
                  Validation completed without blocking errors.
                </p>
              )}
            </div>
          )}
        </ScaffoldSection>
      </ScaffoldContainer>

      {slug && (
        <PluginPublishSidePanel
          visible={showPublishPanel}
          organizationSlug={slug}
          selectedListing={selectedListing}
          onClose={() => {
            setShowPublishPanel(false)
            setSelectedListing(undefined)
          }}
          onSaved={(detail) => setLastSavedDetail(detail)}
        />
      )}

      {slug && selectedForVersion && (
        <PluginVersionSidePanel
          visible={Boolean(selectedForVersion)}
          organizationSlug={slug}
          listing={selectedForVersion}
          onClose={() => setSelectedForVersion(undefined)}
          onSaved={(detail) => setLastSavedDetail(detail)}
        />
      )}
    </>
  )
}
