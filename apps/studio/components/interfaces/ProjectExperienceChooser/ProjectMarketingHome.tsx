import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import {
  Clapperboard,
  ExternalLink,
  Loader2,
  Mail,
  Megaphone,
  Palette,
  Share2,
} from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'common'

import { Badge, Button, cn } from 'ui'
import { Admonition } from 'ui-patterns/admonition'

import { useEmailLaunch } from './useEmailLaunch'
import { useSocialLaunch } from './useSocialLaunch'

type MarketingToolTileProps = {
  title: string
  description: string
  icon: React.ReactNode
  accentClassName: string
  elevated?: boolean
  statusLabel: string
  statusHint?: string
  actions?: React.ReactNode
}

const MarketingToolTile = ({
  title,
  description,
  icon,
  accentClassName,
  elevated = false,
  statusLabel,
  statusHint,
  actions,
}: MarketingToolTileProps) => {
  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border bg-surface-100 p-6 md:p-7',
        elevated ? 'border-foreground-muted' : 'border-dashed opacity-90'
      )}
    >
      {elevated ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0D9488]/[0.08] via-transparent to-transparent"
        />
      ) : null}

      <div className="relative flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className={cn('rounded-xl p-3', accentClassName)}>{icon}</div>
          <Badge variant={elevated ? 'default' : 'warning'}>{statusLabel}</Badge>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-medium tracking-tight md:text-xl">{title}</h2>
          <p className="text-sm leading-relaxed text-foreground-light">{description}</p>
          {statusHint ? (
            <p className="text-xs leading-relaxed text-foreground-lighter">{statusHint}</p>
          ) : null}
        </div>

        {actions ? <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </div>
    </div>
  )
}

/**
 * Indobase Marketing hub — launcher for product engines (email, social, design, video).
 * Email / Social open via Studio SSO (same pattern as Payments).
 */
export const ProjectMarketingHome = () => {
  const { ref } = useParams()
  const { launch: launchEmail, isLaunching: isLaunchingEmail } = useEmailLaunch()
  const { launch: launchSocial, isLaunching: isLaunchingSocial } = useSocialLaunch()
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchDenied, setLaunchDenied] = useState(false)
  const [launchTarget, setLaunchTarget] = useState<'email' | 'social' | null>(null)

  const openEmail = async (mode: 'same-tab' | 'new-tab') => {
    setLaunchError(null)
    setLaunchDenied(false)
    setLaunchTarget('email')
    const result = await launchEmail()
    if (!result.ok) {
      if (result.denied) {
        setLaunchDenied(true)
        setLaunchError(result.message)
        return
      }
      setLaunchError(result.message || 'Could not start Indobase Email session')
      return
    }
    if (mode === 'new-tab') {
      window.open(result.url, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.assign(result.url)
  }

  const openSocial = async (mode: 'same-tab' | 'new-tab') => {
    setLaunchError(null)
    setLaunchDenied(false)
    setLaunchTarget('social')
    const result = await launchSocial()
    if (!result.ok) {
      if (result.denied) {
        setLaunchDenied(true)
        setLaunchError(result.message)
        return
      }
      setLaunchError(result.message || 'Could not start Indobase Social session')
      return
    }
    if (mode === 'new-tab') {
      window.open(result.url, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.assign(result.url)
  }

  const isBusy = isLaunchingEmail || isLaunchingSocial

  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(13,148,136,0.14)_0%,transparent_60%)]"
      />

      <ScaffoldContainer size="large">
        <ScaffoldSection isFullWidth className="py-12 md:py-16">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
            <header className="space-y-4">
              <Badge variant="default">Indobase Marketing</Badge>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-medium leading-[1.15] tracking-tight md:text-4xl">
                  Grow this project — pick a marketing tool
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-foreground-light">
                  Marketing is a hub launcher, not a single frankenstein app. Choose email, social,
                  visual design, or video when you are ready. Email and Social open with the same
                  Studio login (SSO).
                </p>
              </div>
            </header>

            {launchDenied ? (
              <Admonition
                type="warning"
                title="Ask an organization owner or admin"
                description={
                  launchError ||
                  `You do not have access to Indobase ${
                    launchTarget === 'social' ? 'Social' : 'Email'
                  } for this project. Ask an owner or admin to add you as a member.`
                }
              />
            ) : null}

            {launchError && !launchDenied ? (
              <Admonition
                type="destructive"
                title={
                  launchTarget === 'social' ? 'Could not open Social' : 'Could not open Email'
                }
                description={launchError}
              />
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <MarketingToolTile
                title="Email marketing"
                description="Campaigns, audiences, and transactional email for this project — Indobase Email."
                icon={<Mail size={24} strokeWidth={1.75} className="text-[#0D9488]" />}
                accentClassName="bg-[#0D9488]/10"
                elevated
                statusLabel="Available"
                statusHint={
                  ref
                    ? `Opens Indobase Email for project ${ref} (workspace mapped 1:1). After open: Settings → Integrations → Amazon SES (ap-south-1) to send.`
                    : 'Studio SSO handoff — no separate password. Configure Amazon SES (Mumbai) under Email Settings → Integrations to send.'
                }
                actions={
                  <>
                    <Button
                      type="primary"
                      icon={
                        isLaunchingEmail ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <ExternalLink size={14} />
                        )
                      }
                      disabled={isBusy || !ref}
                      onClick={() => void openEmail('same-tab')}
                    >
                      Open Email
                    </Button>
                    <Button
                      type="default"
                      disabled={isBusy || !ref}
                      onClick={() => void openEmail('new-tab')}
                    >
                      Open in new tab
                    </Button>
                  </>
                }
              />

              <MarketingToolTile
                title="Social media posting"
                description="Schedule and publish to social channels from the same Indobase project — Indobase Social."
                icon={<Share2 size={24} strokeWidth={1.75} className="text-[#0284C7]" />}
                accentClassName="bg-[#0284C7]/10"
                elevated
                statusLabel="Available"
                statusHint={
                  ref
                    ? `Opens Indobase Social for project ${ref} (org mapped 1:1). Studio SSO — no separate password.`
                    : 'Studio SSO handoff — no separate password.'
                }
                actions={
                  <>
                    <Button
                      type="primary"
                      icon={
                        isLaunchingSocial ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <ExternalLink size={14} />
                        )
                      }
                      disabled={isBusy || !ref}
                      onClick={() => void openSocial('same-tab')}
                    >
                      Open Social
                    </Button>
                    <Button
                      type="default"
                      disabled={isBusy || !ref}
                      onClick={() => void openSocial('new-tab')}
                    >
                      Open in new tab
                    </Button>
                  </>
                }
              />

              <MarketingToolTile
                title="Visual designer"
                description="Design landing pages, creatives, and brand assets in-browser (Penpot fork)."
                icon={<Palette size={24} strokeWidth={1.75} className="text-[#7C5CD6]" />}
                accentClassName="bg-[#7C5CD6]/10"
                statusLabel="Coming soon"
              />

              <MarketingToolTile
                title="Video editor"
                description="Cut and export product videos and ads without leaving Indobase (OpenCut fork)."
                icon={<Clapperboard size={24} strokeWidth={1.75} className="text-[#E11D48]" />}
                accentClassName="bg-[#E11D48]/10"
                statusLabel="Coming soon"
              />
            </div>

            <p className="flex items-start gap-2 text-xs text-foreground-lighter">
              <Megaphone size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Email is AGPL-3.0 under <code className="text-foreground">indobase-email/</code>.
                Social is AGPL-3.0 under <code className="text-foreground">indobase-social/</code>.
                See <code className="text-foreground">docs/MARKETING.md</code>.
              </span>
            </p>
          </div>
        </ScaffoldSection>
      </ScaffoldContainer>
    </div>
  )
}
