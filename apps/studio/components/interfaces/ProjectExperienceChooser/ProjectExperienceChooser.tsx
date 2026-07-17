import Link from 'next/link'

import { useParams } from 'common'
import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { ArrowRight, Blocks, Database } from 'lucide-react'
import { Badge, Button, cn } from 'ui'

import { BuilderLaunchButton } from './BuilderLaunchButton'

type ExperienceTileProps = {
  title: string
  description: string
  eyebrow: string
  icon: React.ReactNode
  href?: string
  ctaLabel: string
  children?: React.ReactNode
}

const ExperienceTile = ({
  title,
  description,
  eyebrow,
  icon,
  href,
  ctaLabel,
  children,
}: ExperienceTileProps) => {
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-surface-100 p-6 md:p-8">
      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-gradient-to-br from-brand/5 via-transparent to-transparent" />
      <div className="relative flex h-full flex-col justify-between gap-8">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Badge variant="default">{eyebrow}</Badge>
            <div className="rounded-xl border bg-background p-3 text-foreground-light">{icon}</div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
            <p className="max-w-xl text-sm text-foreground-light">{description}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {children}
          {href ? (
            <Button asChild type="primary" size="small" className="w-full sm:w-auto">
              <Link href={href} className="inline-flex items-center gap-2">
                {ctaLabel}
                <ArrowRight size={16} />
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
    <ScaffoldContainer size="large">
      <ScaffoldSection isFullWidth className="py-16 md:py-24">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <div className="space-y-4">
            <Badge variant="default">
              {organization?.name || 'Organization'} / {project?.name || ref}
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight">
                Build web and mobile from one project
              </h1>
              <p className="max-w-2xl text-base text-foreground-light">
                Start in Indobase Builder to ship your web app with AI, publish to Indobase hosting, and
                queue Android bundles in one flow. Open Backend when you need database, auth, storage, or
                infrastructure controls inside Studio.
              </p>
            </div>
          </div>

          <div className={cn('grid gap-6 lg:grid-cols-2')}>
            <ExperienceTile
              eyebrow="Indobase Builder"
              title="Web + mobile in Builder"
              description="Use AI to build your web app, publish on Indobase hosting, and queue Android bundle builds without switching tools."
              icon={<Blocks size={28} strokeWidth={1.5} />}
              ctaLabel="Open Indobase Builder"
            >
              <BuilderLaunchButton
                type="primary"
                size="small"
                className="w-full sm:w-auto"
                nextPath="/?source=studio"
              >
                <span className="inline-flex items-center gap-2">
                  Open Indobase Builder
                  <ArrowRight size={16} />
                </span>
              </BuilderLaunchButton>
            </ExperienceTile>

            <ExperienceTile
              eyebrow="Indobase Studio"
              title="Backend Studio"
              description="Manage your database, authentication, storage, and serverless functions. Studio access follows your organization's plan."
              icon={<Database size={28} strokeWidth={1.5} />}
              href={`/project/${ref}/backend`}
              ctaLabel="Open Studio"
            />
          </div>
        </div>
      </ScaffoldSection>
    </ScaffoldContainer>
  )
}
