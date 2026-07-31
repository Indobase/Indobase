import Link from 'next/link'
import { useState } from 'react'

import { useParams } from 'common'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import {
  BarChart3,
  Blocks,
  Briefcase,
  Check,
  CreditCard,
  Database,
  Image as ImageIcon,
  LayoutGrid,
  Mail,
  Megaphone,
  MessageSquare,
  Calendar as CalendarIcon,
  Rocket,
  Settings,
  Share2,
  Sparkles,
  TrendingUp,
  Video as VideoIcon,
} from 'lucide-react'
import { Badge, Button, cn } from 'ui'

import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'

import { BuilderLaunchButton } from './BuilderLaunchButton'
import { useCrmLaunch } from './useCrmLaunch'
import { useDesignLaunch } from './useDesignLaunch'
import { useDiscussLaunch } from './useDiscussLaunch'
import { useEmailLaunch } from './useEmailLaunch'
import { useMeetLaunch } from './useMeetLaunch'
import { useCalendarLaunch } from './useCalendarLaunch'
import { useSocialLaunch } from './useSocialLaunch'
import { useVideoLaunch } from './useVideoLaunch'

/*
 * Project dashboard — the home surface for a project and the way into every Indobase product.
 *
 * Replaces the previous 2×2 card chooser. That layout implied Indobase is four things you pick
 * between; the suite is now eight products, and the page a user lands on every day should behave
 * like a workspace home rather than a menu: everything reachable at a glance, plus what changed and
 * what still needs doing.
 *
 * Layout (left → right): a product rail, the product grid, then a context column carrying release
 * notes and a setup checklist.
 */

// ── Product grid ────────────────────────────────────────────────────────────────────────────────

type ProductTileProps = {
  name: string
  tagline: string
  icon: React.ReactNode
  /** Accent classes for the icon chip — each product keeps its own colour for scannability. */
  accentClassName: string
  href?: string
  onClick?: () => void
  loading?: boolean
  comingSoon?: boolean
}

const ProductTile = ({
  name,
  tagline,
  icon,
  accentClassName,
  href,
  onClick,
  loading = false,
  comingSoon = false,
}: ProductTileProps) => {
  const className = cn(
    'group relative flex flex-col gap-3 rounded-xl border bg-surface-100 p-4 text-left transition-all duration-150',
    comingSoon
      ? 'cursor-default border-dashed opacity-70'
      : 'hover:-translate-y-0.5 hover:border-foreground-muted hover:shadow-md'
  )

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className={cn('rounded-lg p-2', accentClassName)}>{icon}</div>
        {comingSoon ? (
          <Badge variant="warning" className="text-[10px]">
            Soon
          </Badge>
        ) : loading ? (
          <span className="text-[10px] text-foreground-lighter">Opening…</span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium text-foreground">{name}</h3>
        <p className="text-xs leading-snug text-foreground-light">{tagline}</p>
      </div>
    </>
  )

  if (comingSoon) {
    return <div className={className}>{body}</div>
  }

  // Products behind an SSO handoff can't be plain links — they need a token first, so they render
  // as buttons that call their launch hook.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={loading} className={className}>
        {body}
      </button>
    )
  }

  return (
    <Link href={href ?? '#'} className={className}>
      {body}
    </Link>
  )
}

// ── Rail ────────────────────────────────────────────────────────────────────────────────────────

const RailItem = ({
  icon,
  label,
  href,
  active = false,
}: {
  icon: React.ReactNode
  label: string
  href: string
  active?: boolean
}) => (
  <Link
    href={href}
    title={label}
    aria-label={label}
    className={cn(
      'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
      active
        ? 'bg-foreground/10 text-foreground'
        : 'text-foreground-lighter hover:bg-surface-200 hover:text-foreground'
    )}
  >
    {icon}
  </Link>
)

const RailLaunchItem = ({
  icon,
  label,
  onClick,
  loading = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  loading?: boolean
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={loading}
    onClick={onClick}
    className={cn(
      'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
      'text-foreground-lighter hover:bg-surface-200 hover:text-foreground',
      loading && 'opacity-60'
    )}
  >
    {icon}
  </button>
)

// ── Page ────────────────────────────────────────────────────────────────────────────────────────

export const ProjectExperienceChooser = () => {
  const { ref } = useParams()
  const { data: project } = useSelectedProjectQuery()
  const { data: organization } = useSelectedOrganizationQuery()

  const { launch: launchCrm, isLaunching: isLaunchingCrm } = useCrmLaunch()
  const { launch: launchDesign, isLaunching: isLaunchingDesign } = useDesignLaunch()
  const { launch: launchDiscuss, isLaunching: isLaunchingDiscuss } = useDiscussLaunch()
  const { launch: launchMeet, isLaunching: isLaunchingMeet } = useMeetLaunch()
  const { launch: launchCalendar, isLaunching: isLaunchingCalendar } = useCalendarLaunch()
  const { launch: launchEmail, isLaunching: isLaunchingEmail } = useEmailLaunch()
  const { launch: launchSocial, isLaunching: isLaunchingSocial } = useSocialLaunch()
  const { launch: launchVideo, isLaunching: isLaunchingVideo } = useVideoLaunch()

  const [launchError, setLaunchError] = useState<string | null>(null)

  /** Shared handler: the hooks surface their own toasts, so only the inline banner is set here. */
  const open = async (launch: () => Promise<{ ok: boolean; message?: string; url?: string }>) => {
    setLaunchError(null)
    const result = await launch()
    if (!result.ok) {
      setLaunchError(result.message ?? 'Could not open that product.')
      return
    }
    if (result.url) window.location.assign(result.url)
  }

  /*
   * Setup checklist derived from real project/organization state — not a static list. A step is only
   * shown as done when the underlying thing is actually true, so this stays honest as the project
   * changes.
   */
  const planName = organization?.plan?.name ?? 'Free'
  const isPaidPlan = (organization?.plan?.id ?? 'free') !== 'free'
  const setupSteps = [
    { label: 'Project created', done: Boolean(project?.ref) },
    { label: 'Backend provisioned', done: project?.status === 'ACTIVE_HEALTHY' },
    { label: 'Upgrade for Payments & custom domains', done: isPaidPlan },
  ]
  const remaining = setupSteps.filter((s) => !s.done).length

  return (
    <div className="flex h-full w-full">
      {/* Rail — persistent product-level navigation, mirroring the dashboard wireframe. */}
      <nav
        aria-label="Project sections"
        className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r bg-surface-100 py-4 md:flex"
      >
        <RailItem icon={<LayoutGrid size={18} />} label="Overview" href={`/project/${ref}`} active />
        <RailItem
          icon={<Briefcase size={18} />}
          label={ECOSYSTEM_PRODUCTS.workspace.name}
          href={`/project/${ref}/workspace`}
        />
        <RailLaunchItem
          icon={<TrendingUp size={18} />}
          label={ECOSYSTEM_PRODUCTS.crm.name}
          loading={isLaunchingCrm}
          onClick={() => void open(launchCrm)}
        />
        <RailLaunchItem
          icon={<MessageSquare size={18} />}
          label={ECOSYSTEM_PRODUCTS.discuss.name}
          loading={isLaunchingDiscuss}
          onClick={() => void open(launchDiscuss)}
        />
        <RailLaunchItem
          icon={<VideoIcon size={18} />}
          label={ECOSYSTEM_PRODUCTS.meet.name}
          loading={isLaunchingMeet}
          onClick={() => void open(launchMeet)}
        />
        <RailLaunchItem
          icon={<CalendarIcon size={18} />}
          label={ECOSYSTEM_PRODUCTS.calendar.name}
          loading={isLaunchingCalendar}
          onClick={() => void open(launchCalendar)}
        />
        <RailItem icon={<Database size={18} />} label="Backend" href={`/project/${ref}/backend`} />
        <RailItem icon={<Megaphone size={18} />} label="Marketing" href={`/project/${ref}/marketing`} />
        <RailItem icon={<CreditCard size={18} />} label="Payments" href={`/project/${ref}/payments`} />
        <RailItem icon={<BarChart3 size={18} />} label="Analytics" href={`/project/${ref}/analytics`} />
        <div className="mt-auto">
          <RailItem
            icon={<Settings size={18} />}
            label="Settings"
            href={`/project/${ref}/settings/general`}
          />
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-8">
          {/* Header */}
          <div className="mb-6 space-y-2">
            <Badge variant="default">
              {organization?.name || 'Organization'} / {project?.name || ref}
            </Badge>
            <h1 className="text-2xl font-medium tracking-tight">
              Everything for {project?.name || 'your project'}
            </h1>
            <p className="max-w-2xl text-sm text-foreground-light">
              Build, collaborate, get paid, and grow — one connected business OS for this project.
            </p>
          </div>

          {launchError && (
            <div className="mb-4 rounded-lg border border-destructive-400 bg-destructive-200 px-3 py-2 text-xs text-foreground">
              {launchError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            {/* Products */}
            <section aria-label="Products">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-light">
                Products
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ProductTile
                  name="Builder"
                  tagline="Build your app with AI"
                  icon={<Blocks size={18} className="text-[#3B8FD6]" />}
                  accentClassName="bg-[#3B8FD6]/10"
                  href={`/project/${ref}`}
                />
                <ProductTile
                  name="Backend Studio"
                  tagline="Database, auth, storage, functions"
                  icon={<Database size={18} className="text-[#7C5CD6]" />}
                  accentClassName="bg-[#7C5CD6]/10"
                  href={`/project/${ref}/backend`}
                />
                <ProductTile
                  name={ECOSYSTEM_PRODUCTS.workspace.name}
                  tagline={ECOSYSTEM_PRODUCTS.workspace.tagline}
                  icon={<Briefcase size={18} className="text-[#3B8FD6]" />}
                  accentClassName="bg-[#3B8FD6]/10"
                  href={`/project/${ref}/workspace`}
                />
                <ProductTile
                  name="Payments"
                  tagline="Collect INR, invoices, payouts"
                  icon={<CreditCard size={18} className="text-[#4F46E5]" />}
                  accentClassName="bg-[#4F46E5]/10"
                  href={`/project/${ref}/payments`}
                />
                <ProductTile
                  name="Analytics"
                  tagline="Traffic, signups, product events"
                  icon={<BarChart3 size={18} className="text-[#8B5CF6]" />}
                  accentClassName="bg-[#8B5CF6]/10"
                  href={`/project/${ref}/analytics`}
                />
                <ProductTile
                  name="Design"
                  tagline="Posts, flyers, brand kit"
                  icon={<ImageIcon size={18} className="text-[#EC4899]" />}
                  accentClassName="bg-[#EC4899]/10"
                  onClick={() => open(launchDesign)}
                  loading={isLaunchingDesign}
                />
                <ProductTile
                  name={ECOSYSTEM_PRODUCTS.crm.name}
                  tagline={ECOSYSTEM_PRODUCTS.crm.tagline}
                  icon={<TrendingUp size={18} className="text-[#059669]" />}
                  accentClassName="bg-[#059669]/10"
                  onClick={() => open(launchCrm)}
                  loading={isLaunchingCrm}
                />
                <ProductTile
                  name={ECOSYSTEM_PRODUCTS.discuss.name}
                  tagline={ECOSYSTEM_PRODUCTS.discuss.tagline}
                  icon={<MessageSquare size={18} className="text-[#6366F1]" />}
                  accentClassName="bg-[#6366F1]/10"
                  onClick={() => open(launchDiscuss)}
                  loading={isLaunchingDiscuss}
                />
                <ProductTile
                  name={ECOSYSTEM_PRODUCTS.meet.name}
                  tagline={ECOSYSTEM_PRODUCTS.meet.tagline}
                  icon={<VideoIcon size={18} className="text-[#3B8FD6]" />}
                  accentClassName="bg-[#3B8FD6]/10"
                  onClick={() => open(launchMeet)}
                  loading={isLaunchingMeet}
                />
                <ProductTile
                  name={ECOSYSTEM_PRODUCTS.calendar.name}
                  tagline={ECOSYSTEM_PRODUCTS.calendar.tagline}
                  icon={<CalendarIcon size={18} className="text-[#0EA5E9]" />}
                  accentClassName="bg-[#0EA5E9]/10"
                  onClick={() => open(launchCalendar)}
                  loading={isLaunchingCalendar}
                />
                <ProductTile
                  name="Email"
                  tagline="Campaigns and transactional mail"
                  icon={<Mail size={18} className="text-[#0EA5E9]" />}
                  accentClassName="bg-[#0EA5E9]/10"
                  onClick={() => open(launchEmail)}
                  loading={isLaunchingEmail}
                />
                <ProductTile
                  name="Social"
                  tagline="Schedule posts across channels"
                  icon={<Share2 size={18} className="text-[#10B981]" />}
                  accentClassName="bg-[#10B981]/10"
                  onClick={() => open(launchSocial)}
                  loading={isLaunchingSocial}
                />
                <ProductTile
                  name="Video"
                  tagline="Edit and export video"
                  icon={<VideoIcon size={18} className="text-[#F59E0B]" />}
                  accentClassName="bg-[#F59E0B]/10"
                  onClick={() => open(launchVideo)}
                  loading={isLaunchingVideo}
                />
                <ProductTile
                  name="WhatsApp"
                  tagline="Order updates and support"
                  icon={<Megaphone size={18} className="text-[#22C55E]" />}
                  accentClassName="bg-[#22C55E]/10"
                  comingSoon
                />
              </div>

              <div className="mt-4">
                <BuilderLaunchButton type="primary" size="small" nextPath="/?source=studio">
                  <span className="inline-flex items-center gap-2">
                    <Sparkles size={14} />
                    Open Builder
                  </span>
                </BuilderLaunchButton>
              </div>
            </section>

            {/* Context column — what changed, and what still needs doing. */}
            <aside className="flex flex-col gap-4">
              <section
                aria-label="What's new"
                className="rounded-xl border bg-surface-100 p-4"
              >
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-light">
                  What&apos;s new
                </h2>
                <ul className="space-y-3">
                  {[
                    {
                      title: 'Workspace is connected',
                      body: 'Files, docs, sheets, presentations, meetings, and calendar per project.',
                    },
                    {
                      title: 'Discuss for team chat',
                      body: 'Org and project spaces with Studio SSO — no separate login.',
                    },
                    {
                      title: 'Design is now Canva-class',
                      body: 'Templates, brand kit, layers and PDF/SVG export.',
                    },
                    {
                      title: 'Analytics in every project',
                      body: 'Traffic and product events without a third-party pipeline.',
                    },
                  ].map((item) => (
                    <li key={item.title} className="flex gap-2">
                      <Rocket size={14} className="mt-0.5 shrink-0 text-[#3B8FD6]" />
                      <div>
                        <p className="text-xs font-medium text-foreground">{item.title}</p>
                        <p className="text-xs leading-snug text-foreground-light">{item.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Setup" className="rounded-xl border bg-surface-100 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-light">
                    Setup
                  </h2>
                  <span className="text-[10px] text-foreground-lighter">
                    {remaining === 0 ? 'All done' : `${remaining} left`}
                  </span>
                </div>
                <ul className="space-y-2">
                  {setupSteps.map((step) => (
                    <li key={step.label} className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          step.done
                            ? 'border-brand bg-brand text-background'
                            : 'border-foreground-muted'
                        )}
                      >
                        {step.done && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span
                        className={cn(
                          'text-xs',
                          step.done ? 'text-foreground-light line-through' : 'text-foreground'
                        )}
                      >
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ul>
                {!isPaidPlan && organization?.slug && (
                  <Button asChild type="default" size="tiny" className="mt-3 w-full">
                    <Link href={`/org/${organization.slug}/billing?panel=subscriptionPlan`}>
                      Upgrade from {planName}
                    </Link>
                  </Button>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
