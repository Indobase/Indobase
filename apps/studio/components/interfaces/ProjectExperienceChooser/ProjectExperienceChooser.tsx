import Link from 'next/link'

import { useParams } from 'common'
import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { ArrowRight, BarChart3, Blocks, CreditCard, Database, Megaphone } from 'lucide-react'
import { Badge, Button, cn } from 'ui'

import { BuilderLaunchButton } from './BuilderLaunchButton'

/*
 * Project landing page — the Builder/Studio chooser.
 *
 * Styling follows the marketing site rather than the plain Studio surface: the Indobase blue
 * (#3B8FD6) accent, the gradient brand wordmark, and a soft tinted backdrop. Colour is carried by
 * the icon tiles and the heading only — the cards themselves stay on Studio's own tokens so the
 * page still reads as product UI and keeps working in dark mode.
 */

type ExperienceTileProps = {
  title: string
  description: string
  eyebrow: string
  icon: React.ReactNode
  /** Tailwind classes for the icon tile — each product gets its own accent. */
  accentClassName: string
  href?: string
  ctaLabel?: string
  comingSoon?: boolean
  children?: React.ReactNode
}

const ExperienceTile = ({
  title,
  description,
  eyebrow,
  icon,
  accentClassName,
  href,
  ctaLabel,
  comingSoon = false,
  children,
}: ExperienceTileProps) => {
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-surface-100 p-6 transition-all duration-200 md:p-7',
        // Unreleased tiles must not read as clickable: no lift, no pointer, muted.
        comingSoon
          ? 'border-dashed opacity-75'
          : 'hover:-translate-y-0.5 hover:border-foreground-muted hover:shadow-lg'
      )}
    >
      {!comingSoon && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#3B8FD6]/[0.07] via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />
      )}

      <div className="relative flex h-full flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className={cn('rounded-xl p-3', accentClassName)}>{icon}</div>
          {comingSoon ? (
            <Badge variant="warning">Coming soon</Badge>
          ) : (
            <Badge variant="default">{eyebrow}</Badge>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-medium tracking-tight md:text-2xl">{title}</h2>
          <p className="text-sm leading-relaxed text-foreground-light">{description}</p>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
          {children}
          {href && ctaLabel ? (
            <Button asChild type="primary" size="small" className="w-full sm:w-auto">
              <Link href={href}>
                <span className="inline-flex items-center gap-2">
                  {ctaLabel}
                  <ArrowRight size={16} />
                </span>
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const ProjectExperienceChooser = () => {
  const { ref } = useParams()
  const { data: project } = useSelectedProjectQuery()
  const { data: organization } = useSelectedOrganizationQuery()

  return (
    <div className="relative isolate">
      {/*
        Soft brand wash behind the header, echoing the marketing hero. Kept low-opacity and faded
        out by 60% so it frames the content without turning a product page into a landing page.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(59,143,214,0.16)_0%,transparent_60%)]"
      />

      <ScaffoldContainer size="large">
        <ScaffoldSection isFullWidth className="py-14 md:py-20">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
            <div className="space-y-4">
              <Badge variant="default">
                {organization?.name || 'Organization'} / {project?.name || ref}
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-medium leading-[1.1] tracking-tight md:text-5xl">
                  Build, backend, payments, and{' '}
                  <span className="bg-gradient-to-r from-[#3B8FD6] via-[#5AA0DE] to-[#6AABE0] bg-clip-text text-transparent">
                    marketing
                  </span>{' '}
                  — one project
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-foreground-light">
                  Start in Indobase Builder to ship your web app with AI and publish to Indobase
                  hosting. Open Backend Studio for database, auth, and storage. Indobase Payments
                  and Marketing round out the same project when you are ready to grow.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <ExperienceTile
                eyebrow="Indobase Builder"
                title="Web + mobile in Builder"
                description="Use AI to build your web app, publish on Indobase hosting, and queue Android bundle builds without switching tools."
                icon={<Blocks size={24} strokeWidth={1.75} className="text-[#3B8FD6]" />}
                accentClassName="bg-[#3B8FD6]/10"
              >
                <BuilderLaunchButton
                  type="primary"
                  size="small"
                  className="w-full sm:w-auto"
                  nextPath="/?source=studio"
                >
                  <span className="inline-flex items-center gap-2">
                    Open Builder
                    <ArrowRight size={16} />
                  </span>
                </BuilderLaunchButton>
              </ExperienceTile>

              <ExperienceTile
                eyebrow="Indobase Studio"
                title="Backend Studio"
                description="Manage your database, authentication, storage, and serverless functions. Studio access follows your organization's plan."
                icon={<Database size={24} strokeWidth={1.75} className="text-[#7C5CD6]" />}
                accentClassName="bg-[#7C5CD6]/10"
                href={`/project/${ref}/backend`}
                ctaLabel="Open Studio"
              />

              <ExperienceTile
                eyebrow="Indobase Analytics"
                title="Analytics"
                description="Track signups, active users, and product events for your app — without wiring up a third-party pipeline."
                icon={<BarChart3 size={24} strokeWidth={1.75} className="text-[#8B5CF6]" />}
                accentClassName="bg-[#8B5CF6]/10"
                comingSoon
              />

              {/*
                Indobase Payments — first-party product tile. Accent matches the marketing hero
                Payments tile (#4F46E5). Opens the in-project Payments surface (same Studio session).
              */}
              <ExperienceTile
                eyebrow="Indobase Payments"
                title="Payments"
                description="Collect INR from your customers — subscriptions, invoices, and payouts — in this project. Same Studio login; settles to your own merchant account."
                icon={<CreditCard size={24} strokeWidth={1.75} className="text-[#4F46E5]" />}
                accentClassName="bg-[#4F46E5]/10"
                href={`/project/${ref}/payments`}
                ctaLabel="Open Payments"
              />

              {/*
                Indobase Marketing — hub launcher (email, social, design, video). Accent teal
                matches the Marketing hub. Opens the in-project Marketing surface (same Studio session).
              */}
              <ExperienceTile
                eyebrow="Indobase Marketing"
                title="Marketing"
                description="Email, social, design, and video tools for this project — pick one from the Marketing hub. Same Studio login; engines ship over time."
                icon={<Megaphone size={24} strokeWidth={1.75} className="text-[#0D9488]" />}
                accentClassName="bg-[#0D9488]/10"
                href={`/project/${ref}/marketing`}
                ctaLabel="Open Marketing"
              />
            </div>
          </div>
        </ScaffoldSection>
      </ScaffoldContainer>
    </div>
  )
}
