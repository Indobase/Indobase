import { useEffect, useMemo, useState } from 'react'

import { useOAuthAppsQuery } from 'data/oauth/oauth-apps-query'
import {
  useCreateOrganizationPluginMutation,
  usePluginCategoriesQuery,
  useUpdateOrganizationPluginMutation,
} from 'data/plugin-marketplace/hooks'
import type { PluginDetail, PluginListing } from 'data/plugin-marketplace/types'
import { Badge, Button, Input, SidePanel, cn } from 'ui'

type PluginPublishSidePanelProps = {
  visible: boolean
  organizationSlug: string
  selectedListing?: PluginListing
  onClose: () => void
  onSaved?: (detail: PluginDetail) => void
}

type FormState = {
  oauthAppId: string
  oauthAuthorizeUrl: string
  slug: string
  name: string
  summary: string
  descriptionMd: string
  website: string
  repoUrl: string
  packageType: 'cursor_plugin' | 'mcp_server'
  sourceType: 'github_repo' | 'mcp_endpoint'
  visibility: 'draft' | 'public' | 'unlisted' | 'archived'
  pricingModel: 'free' | 'paid' | 'contact'
  logoUrl: string
  tags: string
  supportedClients: string
  supportedRuntimes: string
  defaultMcpUrl: string
  defaultMcpServerName: string
  version: string
  sourceRef: string
  changelog: string
  submitForReview: boolean
  categories: string[]
}

function makeInitialState(listing?: PluginListing): FormState {
  return {
    oauthAppId: listing?.oauthAppId ?? '',
    oauthAuthorizeUrl: listing?.oauthAuthorizeUrl ?? '',
    slug: listing?.slug ?? '',
    name: listing?.name ?? '',
    summary: listing?.summary ?? '',
    descriptionMd: listing?.descriptionMd ?? '',
    website: listing?.website ?? '',
    repoUrl: listing?.repoUrl ?? '',
    packageType: listing?.packageType ?? 'cursor_plugin',
    sourceType: listing?.sourceType === 'mcp_endpoint' ? 'mcp_endpoint' : 'github_repo',
    visibility: listing?.visibility ?? 'draft',
    pricingModel: listing?.pricingModel ?? 'free',
    logoUrl: listing?.logoUrl ?? '',
    tags: listing?.tags?.join(', ') ?? '',
    supportedClients: listing?.supportedClients?.join(', ') ?? 'cursor',
    supportedRuntimes: listing?.supportedRuntimes?.join(', ') ?? 'mcp',
    defaultMcpUrl: listing?.defaultMcpUrl ?? '',
    defaultMcpServerName: listing?.defaultMcpServerName ?? '',
    version: listing?.latestVersion ?? '0.1.0',
    sourceRef: '',
    changelog: '',
    submitForReview: listing?.reviewStatus === 'submitted',
    categories: listing?.categories?.map((category) => category.slug) ?? [],
  }
}

function splitCommaSeparated(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const PluginPublishSidePanel = ({
  visible,
  organizationSlug,
  selectedListing,
  onClose,
  onSaved,
}: PluginPublishSidePanelProps) => {
  const [form, setForm] = useState<FormState>(makeInitialState(selectedListing))
  const [savedDetail, setSavedDetail] = useState<PluginDetail>()

  const { data: categories = [] } = usePluginCategoriesQuery()
  const { data: oauthApps = [] } = useOAuthAppsQuery({ slug: organizationSlug }, { enabled: visible })

  const createMutation = useCreateOrganizationPluginMutation(organizationSlug)
  const updateMutation = useUpdateOrganizationPluginMutation(organizationSlug, selectedListing?.slug)

  const selectedOAuthApp = useMemo(
    () => oauthApps.find((app) => app.id === form.oauthAppId),
    [oauthApps, form.oauthAppId]
  )

  useEffect(() => {
    if (visible) {
      setForm(makeInitialState(selectedListing))
      setSavedDetail(undefined)
    }
  }, [visible, selectedListing])

  useEffect(() => {
    if (!selectedOAuthApp) return
    setForm((current) => ({
      ...current,
      website: current.website || selectedOAuthApp.website,
    }))
  }, [selectedOAuthApp])

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const latestVersion = savedDetail?.versions?.[0]

  const onSubmit = async () => {
    const payload = {
      oauthAppId: form.oauthAppId || null,
      oauthAppClientId: selectedOAuthApp?.client_id ?? null,
      oauthRedirectUri: selectedOAuthApp?.redirect_uris?.[0] ?? null,
      oauthAuthorizeUrl: form.oauthAuthorizeUrl || null,
      slug: form.slug,
      name: form.name,
      summary: form.summary,
      descriptionMd: form.descriptionMd,
      website: form.website || null,
      repoUrl: form.repoUrl || null,
      packageType: form.packageType,
      sourceType: form.sourceType,
      visibility: form.visibility,
      pricingModel: form.pricingModel,
      logoUrl: form.logoUrl || null,
      tags: splitCommaSeparated(form.tags),
      supportedClients: splitCommaSeparated(form.supportedClients),
      supportedRuntimes: splitCommaSeparated(form.supportedRuntimes),
      defaultMcpUrl: form.defaultMcpUrl || null,
      defaultMcpServerName: form.defaultMcpServerName || null,
      version: form.version,
      sourceRef: form.sourceRef || null,
      changelog: form.changelog || null,
      categories: form.categories,
      submitForReview: form.submitForReview,
    }

    const result = selectedListing
      ? await updateMutation.mutateAsync(payload)
      : await createMutation.mutateAsync(payload)

    setSavedDetail(result)
    onSaved?.(result)
  }

  return (
    <SidePanel
      size="large"
      visible={visible}
      hideFooter
      header={selectedListing ? 'Edit marketplace plugin' : 'Publish plugin to marketplace'}
      onCancel={onClose}
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <SidePanel.Content className="space-y-6 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm text-foreground">OAuth app identity</p>
                <select
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={form.oauthAppId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, oauthAppId: event.target.value }))
                  }
                >
                  <option value="">No linked OAuth app</option>
                  {oauthApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
                {selectedOAuthApp && (
                  <div className="rounded border bg-surface-200 p-3 text-xs text-foreground-light">
                    <p>Client ID: {selectedOAuthApp.client_id}</p>
                    <p>Redirect URI: {selectedOAuthApp.redirect_uris?.[0] || 'Not set'}</p>
                  </div>
                )}
              </div>
              <Input
                label="OAuth authorize URL"
                value={form.oauthAuthorizeUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, oauthAuthorizeUrl: event.target.value }))
                }
                placeholder="https://api.indobase.in/v1/oauth/authorize"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Plugin name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              <Input
                label="Marketplace slug"
                value={form.slug}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              />
            </div>

            <Input
              label="Summary"
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
              placeholder="One-line description used in marketplace cards"
            />

            <Input.TextArea
              label="Long description"
              rows={5}
              value={form.descriptionMd}
              onChange={(event) =>
                setForm((current) => ({ ...current, descriptionMd: event.target.value }))
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Website"
                value={form.website}
                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                placeholder="https://indobase.in"
              />
              <Input
                label="Logo URL"
                value={form.logoUrl}
                onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm text-foreground">Package type</p>
                <select
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={form.packageType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      packageType: event.target.value as FormState['packageType'],
                    }))
                  }
                >
                  <option value="cursor_plugin">Cursor-like plugin package</option>
                  <option value="mcp_server">MCP-only integration</option>
                </select>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-foreground">Source type</p>
                <select
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={form.sourceType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sourceType: event.target.value as FormState['sourceType'],
                    }))
                  }
                >
                  <option value="github_repo">Public GitHub repository</option>
                  <option value="mcp_endpoint">Remote MCP endpoint</option>
                </select>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-foreground">Visibility</p>
                <select
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={form.visibility}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      visibility: event.target.value as FormState['visibility'],
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Repository URL"
                value={form.repoUrl}
                onChange={(event) => setForm((current) => ({ ...current, repoUrl: event.target.value }))}
                placeholder="https://github.com/owner/repo"
              />
              <Input
                label="Default MCP URL"
                value={form.defaultMcpUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, defaultMcpUrl: event.target.value }))
                }
                placeholder="https://mcp.example.com"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="Version"
                value={form.version}
                onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
              />
              <Input
                label="Source ref"
                value={form.sourceRef}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sourceRef: event.target.value }))
                }
                placeholder="main or v0.1.0"
              />
              <Input
                label="MCP server name"
                value={form.defaultMcpServerName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, defaultMcpServerName: event.target.value }))
                }
                placeholder="indobase"
              />
            </div>

            <Input.TextArea
              label="Changelog"
              rows={4}
              value={form.changelog}
              onChange={(event) => setForm((current) => ({ ...current, changelog: event.target.value }))}
              placeholder="What changed in this version?"
            />

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="Tags"
                value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="ai, productivity, database"
              />
              <Input
                label="Supported clients"
                value={form.supportedClients}
                onChange={(event) =>
                  setForm((current) => ({ ...current, supportedClients: event.target.value }))
                }
                placeholder="cursor, claude-code"
              />
              <Input
                label="Supported runtimes"
                value={form.supportedRuntimes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, supportedRuntimes: event.target.value }))
                }
                placeholder="mcp, oauth"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-foreground">Categories</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const selected = form.categories.includes(category.slug)
                  return (
                    <button
                      key={category.slug}
                      type="button"
                      className={cn(
                        'rounded border px-3 py-1 text-xs transition',
                        selected
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-default text-foreground-light'
                      )}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          categories: selected
                            ? current.categories.filter((slug) => slug !== category.slug)
                            : [...current.categories, category.slug],
                        }))
                      }
                    >
                      {category.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.submitForReview}
                onChange={(event) =>
                  setForm((current) => ({ ...current, submitForReview: event.target.checked }))
                }
              />
              Submit this version for review immediately
            </label>

            {latestVersion && (
              <div className="rounded border bg-surface-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">Latest validation result</p>
                    <p className="text-xs text-foreground-light">
                      Version {latestVersion.version} · {latestVersion.validationStatus}
                    </p>
                  </div>
                  <Badge
                    variant={latestVersion.validationStatus === 'valid' ? 'success' : 'warning'}
                  >
                    {latestVersion.validationStatus}
                  </Badge>
                </div>

                {latestVersion.validationErrors.length > 0 && (
                  <div className="space-y-1 pb-3">
                    <p className="text-xs font-medium uppercase text-foreground-light">Errors</p>
                    {latestVersion.validationErrors.map((error) => (
                      <p key={error} className="text-sm text-red-900">
                        {error}
                      </p>
                    ))}
                  </div>
                )}

                {latestVersion.validationWarnings.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase text-foreground-light">Warnings</p>
                    {latestVersion.validationWarnings.map((warning) => (
                      <p key={warning} className="text-sm text-yellow-1100">
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SidePanel.Content>
        </div>

        <SidePanel.Separator />
        <SidePanel.Content>
          <div className="flex items-center justify-between py-3">
            <p className="text-xs text-foreground-light">
              Repo-backed packages are validated on submit. Public GitHub repos are supported in v1.
            </p>
            <div className="flex items-center gap-2">
              <Button type="default" onClick={onClose} disabled={isSubmitting}>
                Close
              </Button>
              <Button onClick={() => void onSubmit()} loading={isSubmitting} disabled={isSubmitting}>
                {selectedListing ? 'Save listing' : 'Publish draft'}
              </Button>
            </div>
          </div>
        </SidePanel.Content>
      </div>
    </SidePanel>
  )
}
