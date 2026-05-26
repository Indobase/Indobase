import { useState } from 'react'

import CopyButton from 'components/ui/CopyButton'
import { useInstallPluginMutation } from 'data/plugin-marketplace/hooks'
import type { PluginListing } from 'data/plugin-marketplace/types'
import { Button, Input } from 'ui'

type PluginInstallPanelProps = {
  listing: PluginListing
}

export const PluginInstallPanel = ({ listing }: PluginInstallPanelProps) => {
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [projectRef, setProjectRef] = useState('')
  const mutation = useInstallPluginMutation(listing.slug)

  const result = mutation.data
  const clientPayload = result?.payload.clientPayload ?? {}

  return (
    <div className="rounded border bg-surface-100 p-4">
      <div className="space-y-1">
        <p className="text-sm text-foreground">Install</p>
        <p className="text-sm text-foreground-light">
          Generate a Cursor-ready install payload and, when configured, an OAuth consent URL for
          this plugin.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Input
          label="Target organization slug"
          value={organizationSlug}
          onChange={(event) => setOrganizationSlug(event.target.value)}
          placeholder="optional"
        />
        <Input
          label="Target project ref"
          value={projectRef}
          onChange={(event) => setProjectRef(event.target.value)}
          placeholder="optional"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          onClick={() =>
            mutation.mutate({
              client: 'cursor',
              organizationSlug: organizationSlug || null,
              projectRef: projectRef || null,
              readOnly: true,
              features: ['account', 'database', 'development'],
            })
          }
          loading={mutation.isPending}
        >
          Generate Cursor install
        </Button>
        {result?.payload.authorizeUrl && (
          <Button
            type="default"
            onClick={() => window.open(result.payload.authorizeUrl ?? '', '_blank', 'noopener')}
          >
            Open OAuth consent
          </Button>
        )}
      </div>

      {result && (
        <div className="mt-4 space-y-4 rounded border bg-background p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase text-foreground-light">MCP URL</p>
              <CopyButton text={result.payload.mcpUrl} type="default" iconOnly />
            </div>
            <p className="break-all font-mono text-xs">{result.payload.mcpUrl}</p>
          </div>

          {'deepLink' in clientPayload && typeof clientPayload.deepLink === 'string' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase text-foreground-light">Cursor deep link</p>
                <CopyButton text={clientPayload.deepLink} type="default" iconOnly />
              </div>
              <p className="break-all font-mono text-xs">{clientPayload.deepLink}</p>
            </div>
          )}

          {'config' in clientPayload && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase text-foreground-light">Cursor config</p>
                <CopyButton
                  text={JSON.stringify(clientPayload.config, null, 2)}
                  type="default"
                  iconOnly
                />
              </div>
              <pre className="overflow-x-auto rounded bg-surface-200 p-3 text-xs">
                {JSON.stringify(clientPayload.config, null, 2)}
              </pre>
            </div>
          )}

          {result.payload.authorizeUrl && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase text-foreground-light">OAuth consent URL</p>
                <CopyButton text={result.payload.authorizeUrl} type="default" iconOnly />
              </div>
              <p className="break-all font-mono text-xs">{result.payload.authorizeUrl}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
