import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import AlertError from 'components/ui/AlertError'
import {
  useMarketplacePluginsQuery,
  usePluginCategoriesQuery,
} from 'data/plugin-marketplace/hooks'
import { Badge, Button, Input } from 'ui'
import { ShimmeringLoader } from 'ui-patterns/ShimmeringLoader'

export const PluginMarketplaceList = () => {
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>()

  const categoriesQuery = usePluginCategoriesQuery()
  const listingsQuery = useMarketplacePluginsQuery({ search, category })

  const categories = categoriesQuery.data ?? []
  const listings = listingsQuery.data ?? []

  const total = useMemo(() => listings.length, [listings])

  return (
    <ScaffoldContainer>
      <ScaffoldSection isFullWidth className="space-y-6">
        <div className="space-y-2">
          <p>Plugin marketplace</p>
          <p className="text-sm text-foreground-light">
            Discover Cursor-like plugins and MCP integrations published by Indobase organizations.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded border bg-surface-100 p-4 md:flex-row md:items-end">
          <Input
            label="Search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search by name, summary, or slug"
          />
          <Button type="default" onClick={() => setSearch(draftSearch)}>
            Apply search
          </Button>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded border px-3 py-1 text-xs ${!category ? 'border-brand text-brand' : ''}`}
              onClick={() => setCategory(undefined)}
            >
              All
            </button>
            {categories.map((item) => (
              <button
                key={item.slug}
                type="button"
                className={`rounded border px-3 py-1 text-xs ${
                  category === item.slug ? 'border-brand text-brand' : ''
                }`}
                onClick={() => setCategory(item.slug)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}

        {listingsQuery.isPending && (
          <div className="space-y-2">
            <ShimmeringLoader />
            <ShimmeringLoader className="w-3/4" />
            <ShimmeringLoader className="w-1/2" />
          </div>
        )}

        {listingsQuery.error && (
          <AlertError error={listingsQuery.error} subject="Failed to load marketplace listings" />
        )}

        {!listingsQuery.isPending && !listingsQuery.error && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-light">{total} plugins found</p>

            {listings.length === 0 ? (
              <div className="rounded border bg-surface-100 p-4 text-sm text-foreground-light">
                No plugins match your current filters.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {listings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/plugins/${listing.slug}`}
                    className="rounded border bg-surface-100 p-4 transition hover:border-brand"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{listing.name}</p>
                        <p className="text-sm text-foreground-light">{listing.summary}</p>
                      </div>
                      <Badge variant="default">{listing.packageType}</Badge>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {listing.categories.map((item) => (
                        <Badge key={item.slug} variant="default">
                          {item.name}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-foreground-light">
                      <span>{listing.organizationName}</span>
                      <span>{listing.installCount} installs</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </ScaffoldSection>
    </ScaffoldContainer>
  )
}
