import { PermissionAction } from '@supabase/shared-types/out/constants'
import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { useParams } from 'common'
import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import Table from 'components/to-be-cleaned/Table'
import AlertError from 'components/ui/AlertError'
import { ButtonTooltip } from 'components/ui/ButtonTooltip'
import CopyButton from 'components/ui/CopyButton'
import NoPermission from 'components/ui/NoPermission'
import { AuthorizedApp, useAuthorizedAppsQuery } from 'data/oauth/authorized-apps-query'
import { OAuthAppCreateResponse } from 'data/oauth/oauth-app-create-mutation'
import { OAuthApp, useOAuthAppsQuery } from 'data/oauth/oauth-apps-query'
import { useOrganizationPluginsQuery } from 'data/plugin-marketplace/hooks'
import type { PluginListing } from 'data/plugin-marketplace/types'
import { useAsyncCheckPermissions } from 'hooks/misc/useCheckPermissions'
import { Button, cn } from 'ui'
import { ShimmeringLoader } from 'ui-patterns/ShimmeringLoader'
import { PluginPublishSidePanel } from 'components/interfaces/PluginMarketplace/PluginPublishSidePanel'
import { AuthorizedAppRow } from './AuthorizedAppRow'
import { DeleteAppModal } from './DeleteAppModal'
import { OAuthAppRow } from './OAuthAppRow'
import { PublishAppSidePanel } from './PublishAppSidePanel'
import { RevokeAppModal } from './RevokeAppModal'

// [Joshen] Note on nav UX
// Kang Ming mentioned that it might be better to split Published Apps and Authorized Apps into 2 separate tabs
// to prevent any confusion (case study: GitHub). Authorized apps could be in the "integrations" tab, but let's
// check in again after we wrap up Vercel integration

export const OAuthApps = () => {
  const { slug } = useParams()
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [createdApp, setCreatedApp] = useState<OAuthAppCreateResponse>()
  const [selectedAppToUpdate, setSelectedAppToUpdate] = useState<OAuthApp>()
  const [selectedAppToDelete, setSelectedAppToDelete] = useState<OAuthApp>()
  const [selectedAppToRevoke, setSelectedAppToRevoke] = useState<AuthorizedApp>()
  const [showPluginPublishModal, setShowPluginPublishModal] = useState(false)
  const [selectedPluginToUpdate, setSelectedPluginToUpdate] = useState<PluginListing>()

  const { can: canReadOAuthApps, isLoading: isLoadingPermissions } = useAsyncCheckPermissions(
    PermissionAction.READ,
    'approved_oauth_apps'
  )
  const { can: canCreateOAuthApps } = useAsyncCheckPermissions(
    PermissionAction.CREATE,
    'approved_oauth_apps'
  )

  const {
    data: publishedApps,
    error: publishedAppsError,
    isPending: isLoadingPublishedApps,
    isSuccess: isSuccessPublishedApps,
    isError: isErrorPublishedApps,
  } = useOAuthAppsQuery({ slug }, { enabled: canReadOAuthApps })

  const sortedPublishedApps = publishedApps?.sort((a, b) => {
    return Number(new Date(a.created_at ?? '')) - Number(new Date(b.created_at ?? ''))
  })

  const {
    data: authorizedApps,
    isPending: isLoadingAuthorizedApps,
    isSuccess: isSuccessAuthorizedApps,
    isError: isErrorAuthorizedApps,
  } = useAuthorizedAppsQuery({ slug })

  const sortedAuthorizedApps = authorizedApps?.sort((a, b) => {
    return Number(new Date(a.authorized_at)) - Number(new Date(b.authorized_at))
  })

  const {
    data: orgPlugins,
    isPending: isLoadingOrgPlugins,
    isError: isErrorOrgPlugins,
    error: orgPluginsError,
  } = useOrganizationPluginsQuery(slug)

  return (
    <>
      <ScaffoldContainer>
        <ScaffoldSection isFullWidth className="flex flex-col gap-y-8">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <div>
                <p>Published Apps</p>
                <p className="text-foreground-light text-sm">
                  Build integrations that extend Indobase's functionality
                </p>
              </div>
              <ButtonTooltip
                disabled={!canCreateOAuthApps}
                type="primary"
                onClick={() => setShowPublishModal(true)}
                tooltip={{
                  content: {
                    side: 'bottom',
                    text: !canCreateOAuthApps
                      ? 'You need additional permissions to create apps'
                      : undefined,
                  },
                }}
              >
                Add application
              </ButtonTooltip>
            </div>

            {isLoadingPublishedApps || isLoadingPermissions ? (
              <div className="space-y-2">
                <ShimmeringLoader />
                <ShimmeringLoader className="w-3/4" />
                <ShimmeringLoader className="w-1/2" />
              </div>
            ) : !canReadOAuthApps ? (
              <NoPermission resourceText="view OAuth apps" />
            ) : null}

            {isErrorPublishedApps && (
              <AlertError
                error={publishedAppsError}
                subject="Failed to retrieve published OAuth apps"
              />
            )}

            {createdApp !== undefined && (
              <div
                className={cn(
                  'flex items-center justify-between p-4 px-6 border first:rounded-t last:rounded-b',
                  'bg-background-alternative',
                  'rounded'
                )}
              >
                <div className="absolute top-4 right-4">
                  <Button
                    type="text"
                    icon={<X size={18} />}
                    className="px-1"
                    onClick={() => setCreatedApp(undefined)}
                  />
                </div>
                <div className="w-full space-y-4">
                  <div className="flex flex-col gap-0">
                    <div className="flex items-center gap-2">
                      <Check size={14} className="text-brand" strokeWidth={3} />
                      <p className="text-sm">You've created your new OAuth application.</p>
                    </div>
                    <p className="text-sm text-foreground-light">
                      Ensure that you store the client secret securely - you will not be able to see
                      it again.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground-light">Client ID</p>
                      <p className="font-mono text-sm">{createdApp.client_id}</p>
                      <CopyButton text={createdApp.client_id} type="default" iconOnly />
                    </div>

                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground-light">Client Secret</p>
                      <p className="font-mono text-sm">{createdApp.client_secret}</p>
                      <CopyButton text={createdApp.client_secret} type="default" iconOnly />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isSuccessPublishedApps && (
              <>
                {(publishedApps?.length ?? 0) === 0 ? (
                  <div className="bg-surface-100 border rounded p-4 flex items-center justify-between mt-4">
                    <p className="prose text-sm">You do not have any published applications yet</p>
                  </div>
                ) : (
                  <Table
                    head={[
                      <Table.th key="icon" className="w-[30px]"></Table.th>,
                      <Table.th key="name">Name</Table.th>,
                      <Table.th key="client-id">Client ID</Table.th>,
                      <Table.th key="created-at">Created at</Table.th>,
                      <Table.th key="delete-action"></Table.th>,
                    ]}
                    body={
                      sortedPublishedApps?.map((app) => (
                        <OAuthAppRow
                          key={app.id}
                          app={app}
                          onSelectEdit={() => {
                            setShowPublishModal(true)
                            setSelectedAppToUpdate(app)
                          }}
                          onSelectDelete={() => setSelectedAppToDelete(app)}
                        />
                      )) ?? []
                    }
                  />
                )}
              </>
            )}
          </div>

          <div>
            <p>Authorized Apps</p>
            <p className="text-foreground-light text-sm">
              Applications that have access to your organization's settings and projects
            </p>

            <div className="mt-4">
              {isLoadingAuthorizedApps || isLoadingPermissions ? (
                <div className="space-y-2">
                  <ShimmeringLoader />
                  <ShimmeringLoader className="w-3/4" />
                  <ShimmeringLoader className="w-1/2" />
                </div>
              ) : !canReadOAuthApps ? (
                <NoPermission resourceText="view authorized apps" />
              ) : null}

              {isErrorAuthorizedApps && <AlertError subject="Failed to retrieve authorized apps" />}

              {isSuccessAuthorizedApps && (
                <>
                  {(authorizedApps.length ?? 0) === 0 ? (
                    <div className="bg-surface-100 border rounded p-4 flex items-center justify-between">
                      <p className="prose text-sm">
                        You do not have any authorized applications yet
                      </p>
                    </div>
                  ) : (
                    <Table
                      className="mt-4"
                      head={[
                        <Table.th key="icon" className="w-[30px]"></Table.th>,
                        <Table.th key="name">Name</Table.th>,
                        <Table.th key="created-by">Created by</Table.th>,
                        <Table.th key="app-id">App ID</Table.th>,
                        <Table.th key="authorized-at">Authorized at</Table.th>,
                        <Table.th key="delete-action"></Table.th>,
                      ]}
                      body={
                        sortedAuthorizedApps?.map((app) => (
                          <AuthorizedAppRow
                            key={app.id}
                            app={app}
                            onSelectRevoke={() => setSelectedAppToRevoke(app)}
                          />
                        )) ?? []
                      }
                    />
                  )}
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <div>
                <p>Marketplace Plugins</p>
                <p className="text-foreground-light text-sm">
                  Turn your OAuth app into a reviewable plugin or MCP integration.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="default" asChild>
                  <Link href={`/org/${slug}/plugins`}>Open management page</Link>
                </Button>
                <ButtonTooltip
                  disabled={!canCreateOAuthApps}
                  onClick={() => setShowPluginPublishModal(true)}
                  tooltip={{
                    content: {
                      side: 'bottom',
                      text: !canCreateOAuthApps
                        ? 'You need additional permissions to publish plugins'
                        : undefined,
                    },
                  }}
                >
                  Publish plugin
                </ButtonTooltip>
              </div>
            </div>

            {isLoadingOrgPlugins ? (
              <div className="space-y-2">
                <ShimmeringLoader />
                <ShimmeringLoader className="w-3/4" />
              </div>
            ) : null}

            {isErrorOrgPlugins && (
              <AlertError error={orgPluginsError} subject="Failed to retrieve marketplace plugins" />
            )}

            {!isLoadingOrgPlugins && !isErrorOrgPlugins && (orgPlugins?.length ?? 0) === 0 && (
              <div className="bg-surface-100 border rounded p-4 flex items-center justify-between">
                <p className="prose text-sm">
                  No marketplace plugins yet. Link one of your OAuth apps to a repo-backed package.
                </p>
              </div>
            )}

            {!isLoadingOrgPlugins && !isErrorOrgPlugins && (orgPlugins?.length ?? 0) > 0 && (
              <Table
                head={[
                  <Table.th key="plugin-name">Plugin</Table.th>,
                  <Table.th key="plugin-review">Review</Table.th>,
                  <Table.th key="plugin-validation">Validation</Table.th>,
                  <Table.th key="plugin-version">Version</Table.th>,
                  <Table.th key="plugin-actions"></Table.th>,
                ]}
                body={
                  orgPlugins?.map((plugin) => (
                    <Table.tr key={plugin.id}>
                      <Table.td>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p>{plugin.name}</p>
                            <p className="text-xs text-foreground-light">{plugin.packageType}</p>
                          </div>
                          <p className="text-sm text-foreground-light">{plugin.summary}</p>
                        </div>
                      </Table.td>
                      <Table.td>{plugin.reviewStatus}</Table.td>
                      <Table.td>{plugin.latestValidationStatus}</Table.td>
                      <Table.td>{plugin.latestVersion ?? 'n/a'}</Table.td>
                      <Table.td>
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/plugins/${plugin.slug}`} className="text-sm text-brand">
                            View
                          </Link>
                          <Button
                            type="default"
                            onClick={() => {
                              setSelectedPluginToUpdate(plugin)
                              setShowPluginPublishModal(true)
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      </Table.td>
                    </Table.tr>
                  )) ?? []
                }
              />
            )}
          </div>
        </ScaffoldSection>
      </ScaffoldContainer>

      <PublishAppSidePanel
        visible={showPublishModal}
        selectedApp={selectedAppToUpdate}
        onClose={() => {
          setSelectedAppToUpdate(undefined)
          setShowPublishModal(false)
        }}
        onCreateSuccess={setCreatedApp}
      />
      <DeleteAppModal
        selectedApp={selectedAppToDelete}
        onClose={() => setSelectedAppToDelete(undefined)}
      />
      <RevokeAppModal
        selectedApp={selectedAppToRevoke}
        onClose={() => setSelectedAppToRevoke(undefined)}
      />
      {slug && (
        <PluginPublishSidePanel
          visible={showPluginPublishModal}
          organizationSlug={slug}
          selectedListing={selectedPluginToUpdate}
          onClose={() => {
            setShowPluginPublishModal(false)
            setSelectedPluginToUpdate(undefined)
          }}
        />
      )}
    </>
  )
}
