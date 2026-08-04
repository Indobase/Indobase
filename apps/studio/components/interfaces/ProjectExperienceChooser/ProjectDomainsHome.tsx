'use client'

import { useCallback, useState } from 'react'
import { ExternalLink, Globe, Loader2, Search } from 'lucide-react'

import { useParams } from 'common'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { Button } from 'ui'
import { Admonition } from 'ui-patterns/admonition'

import { resetAutoLaunch, useAutoLaunchProduct } from './useAutoLaunchProduct'
import { useDomainsLaunch } from './useDomainsLaunch'

/**
 * Studio Domains hub — SSO into the standalone Domains product (search / buy / manage).
 *
 * Auto-opens once per tab; Back lands here with manual CTAs so users are not trapped in a loop.
 */
export const ProjectDomainsHome = () => {
  const { ref } = useParams()
  const { launch, isLaunching } = useDomainsLaunch({ projectRef: ref })
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchDenied, setLaunchDenied] = useState(false)

  const openDomains = useCallback(
    async (mode: 'same-tab' | 'new-tab') => {
      resetAutoLaunch('domains', ref)
      setLaunchError(null)
      setLaunchDenied(false)
      const result = await launch()
      if (!result.ok) {
        if (result.denied) {
          setLaunchDenied(true)
          setLaunchError(result.message)
          return
        }
        setLaunchError(result.message || 'Could not open Domains')
        return
      }
      if (mode === 'new-tab') {
        window.open(result.url, '_blank', 'noopener,noreferrer')
        return
      }
      window.location.assign(result.url)
    },
    [launch, ref]
  )

  const { isAutoLaunching } = useAutoLaunchProduct({
    product: 'domains',
    projectRef: ref,
    launch: () => openDomains('same-tab'),
  })

  if (isAutoLaunching) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-foreground">Opening {ECOSYSTEM_PRODUCTS.domains.name}…</p>
        <p className="text-xs text-foreground-light">Signing you in with your Studio session.</p>
      </div>
    )
  }

  if (!ref) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6">
        <p className="text-sm text-foreground-light">Project ref is required</p>
      </div>
    )
  }

  if (launchDenied) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-16">
        <Admonition
          type="warning"
          title="Ask an organization owner or admin"
          description="You do not have access to Domains for this project. Ask an owner or admin to add you as a member."
        />
        <Button type="default" loading={isLaunching} onClick={() => openDomains('same-tab')}>
          Retry
        </Button>
      </div>
    )
  }

  const product = ECOSYSTEM_PRODUCTS.domains

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-lighter">
          Indobase {product.name}
        </p>
        <h1 className="text-xl font-medium text-foreground">
          Search, register, and manage domains
        </h1>
        <p className="max-w-2xl text-sm text-foreground-light">
          Buy a domain for this project, point it at Indobase Hosting, and manage renewals — same
          Studio login via secure handoff to {product.host}.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3B8FD6]/10">
            <Search size={18} className="text-[#3B8FD6]" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{product.buyLabel}</p>
            <p className="text-xs text-foreground-light">
              Check availability and register in INR through Indobase checkout.
            </p>
          </div>
          <Button
            type="primary"
            className="mt-auto w-full sm:w-auto"
            loading={isLaunching}
            onClick={() => openDomains('same-tab')}
          >
            {product.buyLabel}
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#059669]/10">
            <Globe size={18} className="text-[#059669]" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{product.openLabel}</p>
            <p className="text-xs text-foreground-light">
              Manage registrations, DNS nameservers, and project-linked domains.
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button type="default" loading={isLaunching} onClick={() => openDomains('same-tab')}>
              {product.openLabel}
            </Button>
            <Button
              type="default"
              icon={<ExternalLink size={14} />}
              loading={isLaunching}
              onClick={() => openDomains('new-tab')}
            >
              New tab
            </Button>
          </div>
        </div>
      </section>

      {launchError ? (
        <Admonition type="destructive" title="Could not open Domains" description={launchError} />
      ) : null}

      {isLaunching ? (
        <p className="inline-flex items-center gap-2 text-xs text-foreground-lighter">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Starting Domains session…
        </p>
      ) : null}
    </div>
  )
}
