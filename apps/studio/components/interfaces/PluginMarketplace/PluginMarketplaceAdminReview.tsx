import Link from 'next/link'
import { useState } from 'react'

import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import Table from 'components/to-be-cleaned/Table'
import AlertError from 'components/ui/AlertError'
import {
  useAdminPluginReviewQueueQuery,
  useReviewPluginMutation,
} from 'data/plugin-marketplace/hooks'
import type { PluginListing } from 'data/plugin-marketplace/types'
import { Badge, Button, Input } from 'ui'
import { ShimmeringLoader } from 'ui-patterns/ShimmeringLoader'

function ReviewActions({ listing }: { listing: PluginListing }) {
  const [notes, setNotes] = useState('')
  const mutation = useReviewPluginMutation(listing.slug)

  return (
    <div className="space-y-2">
      <Input.TextArea
        rows={3}
        placeholder="Optional review notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button
          onClick={() =>
            mutation.mutate({
              status: 'approved',
              notes: notes || null,
              publishVisibility: listing.visibility === 'unlisted' ? 'unlisted' : 'public',
            })
          }
          loading={mutation.isPending}
        >
          Approve
        </Button>
        <Button
          type="default"
          onClick={() => mutation.mutate({ status: 'changes_requested', notes: notes || null })}
          loading={mutation.isPending}
        >
          Changes requested
        </Button>
        <Button
          type="danger"
          onClick={() => mutation.mutate({ status: 'rejected', notes: notes || null })}
          loading={mutation.isPending}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}

export const PluginMarketplaceAdminReview = () => {
  const { data = [], error, isPending } = useAdminPluginReviewQueueQuery()

  return (
    <ScaffoldContainer>
      <ScaffoldSection isFullWidth className="space-y-6">
        <div className="space-y-2">
          <p>Plugin review queue</p>
          <p className="text-sm text-foreground-light">
            Moderate submitted marketplace listings, approve versions, and keep the public catalog
            trusted.
          </p>
        </div>

        {isPending && (
          <div className="space-y-2">
            <ShimmeringLoader />
            <ShimmeringLoader className="w-3/4" />
          </div>
        )}

        {error && <AlertError error={error} subject="Failed to load plugin review queue" />}

        {!isPending && !error && data.length === 0 && (
          <div className="rounded border bg-surface-100 p-4 text-sm text-foreground-light">
            No listings are waiting for review right now.
          </div>
        )}

        {!isPending && !error && data.length > 0 && (
          <Table
            head={[
              <Table.th key="plugin">Plugin</Table.th>,
              <Table.th key="publisher">Publisher</Table.th>,
              <Table.th key="status">State</Table.th>,
              <Table.th key="validation">Validation</Table.th>,
              <Table.th key="actions">Review</Table.th>,
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
                    <Link href={`/plugins/${listing.slug}`} className="text-xs text-brand">
                      Open detail page
                    </Link>
                  </div>
                </Table.td>
                <Table.td>
                  <div className="space-y-1">
                    <p>{listing.organizationName}</p>
                    <p className="text-xs text-foreground-light">{listing.organizationSlug}</p>
                  </div>
                </Table.td>
                <Table.td>
                  <Badge variant="default">{listing.reviewStatus}</Badge>
                </Table.td>
                <Table.td>
                  <Badge
                    variant={listing.latestValidationStatus === 'valid' ? 'success' : 'warning'}
                  >
                    {listing.latestValidationStatus}
                  </Badge>
                </Table.td>
                <Table.td>
                  <ReviewActions listing={listing} />
                </Table.td>
              </Table.tr>
            ))}
          />
        )}
      </ScaffoldSection>
    </ScaffoldContainer>
  )
}
