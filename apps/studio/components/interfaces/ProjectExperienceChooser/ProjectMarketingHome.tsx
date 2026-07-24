import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import { Clapperboard, Mail, Megaphone, Palette, Share2 } from 'lucide-react'
import { Badge, cn } from 'ui'

type MarketingToolTileProps = {
  title: string
  description: string
  icon: React.ReactNode
  accentClassName: string
  /** Elevated “first up” tile (Email) vs other Coming soon tools. */
  elevated?: boolean
  statusLabel: string
  statusHint?: string
}

const MarketingToolTile = ({
  title,
  description,
  icon,
  accentClassName,
  elevated = false,
  statusLabel,
  statusHint,
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
      </div>
    </div>
  )
}

/**
 * Indobase Marketing hub — launcher for planned product engines (email, social, design, video).
 * Same ungated project surface pattern as Payments: no Backend Studio sidebar / plan gate.
 * Engines are not forked or deployed yet; tiles are Coming soon with Email elevated as first up.
 */
export const ProjectMarketingHome = () => {
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
                  visual design, or video when you are ready. Each tool will open with the same
                  Studio login (SSO) once its engine ships.
                </p>
              </div>
            </header>

            <div className="grid gap-5 md:grid-cols-2">
              <MarketingToolTile
                title="Email marketing"
                description="Campaigns, audiences, and transactional email for this project — powered by Indobase Email (Notifuse fork)."
                icon={<Mail size={24} strokeWidth={1.75} className="text-[#0D9488]" />}
                accentClassName="bg-[#0D9488]/10"
                elevated
                statusLabel="First up"
                statusHint="Coming soon — Studio SSO next. No separate password; handoff from this project."
              />

              <MarketingToolTile
                title="Social media posting"
                description="Schedule and publish to social channels from the same Indobase project (Postiz fork)."
                icon={<Share2 size={24} strokeWidth={1.75} className="text-[#0284C7]" />}
                accentClassName="bg-[#0284C7]/10"
                statusLabel="Coming soon"
                statusHint="Next after Email marketing."
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
                Engines are planned forks with their own licenses (AGPL for Email/Social; MPL for
                design; MIT for video). See{' '}
                <code className="text-foreground">docs/MARKETING.md</code> for sequencing and
                compliance notes.
              </span>
            </p>
          </div>
        </ScaffoldSection>
      </ScaffoldContainer>
    </div>
  )
}
