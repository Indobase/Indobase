import { useEffect, useState } from 'react'

import { useCreatePluginVersionMutation } from 'data/plugin-marketplace/hooks'
import type { PluginDetail, PluginListing } from 'data/plugin-marketplace/types'
import { Badge, Button, Input, SidePanel } from 'ui'

type PluginVersionSidePanelProps = {
  visible: boolean
  organizationSlug: string
  listing: PluginListing
  onClose: () => void
  onSaved?: (detail: PluginDetail) => void
}

export const PluginVersionSidePanel = ({
  visible,
  organizationSlug,
  listing,
  onClose,
  onSaved,
}: PluginVersionSidePanelProps) => {
  const [version, setVersion] = useState('0.1.1')
  const [repoUrl, setRepoUrl] = useState(listing.repoUrl ?? '')
  const [sourceRef, setSourceRef] = useState('')
  const [changelog, setChangelog] = useState('')
  const [defaultMcpUrl, setDefaultMcpUrl] = useState(listing.defaultMcpUrl ?? '')
  const [submitForReview, setSubmitForReview] = useState(true)
  const [savedDetail, setSavedDetail] = useState<PluginDetail>()

  const mutation = useCreatePluginVersionMutation(organizationSlug, listing.slug)

  useEffect(() => {
    if (visible) {
      setVersion('0.1.1')
      setRepoUrl(listing.repoUrl ?? '')
      setSourceRef('')
      setChangelog('')
      setDefaultMcpUrl(listing.defaultMcpUrl ?? '')
      setSubmitForReview(true)
      setSavedDetail(undefined)
    }
  }, [visible, listing])

  const latestVersion = savedDetail?.versions?.[0]

  const onSubmit = async () => {
    const result = await mutation.mutateAsync({
      version,
      repoUrl: repoUrl || null,
      sourceRef: sourceRef || null,
      changelog: changelog || null,
      packageType: listing.packageType,
      sourceType: listing.sourceType,
      defaultMcpUrl: defaultMcpUrl || null,
      defaultMcpServerName: listing.defaultMcpServerName || listing.slug,
      submitForReview,
    })
    setSavedDetail(result)
    onSaved?.(result)
  }

  return (
    <SidePanel
      size="large"
      visible={visible}
      hideFooter
      header={`Submit new version for ${listing.name}`}
      onCancel={onClose}
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <SidePanel.Content className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Version" value={version} onChange={(e) => setVersion(e.target.value)} />
              <Input
                label="Source ref"
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder="main or tag"
              />
            </div>
            <Input
              label="Repository URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
            />
            <Input
              label="Default MCP URL"
              value={defaultMcpUrl}
              onChange={(e) => setDefaultMcpUrl(e.target.value)}
              placeholder="https://mcp.example.com"
            />
            <Input.TextArea
              label="Changelog"
              rows={5}
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={submitForReview}
                onChange={(event) => setSubmitForReview(event.target.checked)}
              />
              Submit this version for admin review immediately
            </label>

            {latestVersion && (
              <div className="rounded border bg-surface-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-foreground">Validation result</p>
                  <Badge variant={latestVersion.validationStatus === 'valid' ? 'success' : 'warning'}>
                    {latestVersion.validationStatus}
                  </Badge>
                </div>
                {latestVersion.validationErrors.length > 0 && (
                  <div className="space-y-1 pb-3">
                    {latestVersion.validationErrors.map((error) => (
                      <p key={error} className="text-sm text-red-900">
                        {error}
                      </p>
                    ))}
                  </div>
                )}
                {latestVersion.validationWarnings.map((warning) => (
                  <p key={warning} className="text-sm text-yellow-1100">
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </SidePanel.Content>
        </div>
        <SidePanel.Separator />
        <SidePanel.Content>
          <div className="flex items-center justify-end gap-2 py-3">
            <Button type="default" onClick={onClose} disabled={mutation.isPending}>
              Close
            </Button>
            <Button onClick={() => void onSubmit()} loading={mutation.isPending}>
              Submit version
            </Button>
          </div>
        </SidePanel.Content>
      </div>
    </SidePanel>
  )
}
