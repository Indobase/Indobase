import { useEffect, useState } from 'react'

import { useParams } from 'common'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LayoutGrid,
  Mail,
  Presentation,
  Video,
} from 'lucide-react'
import { Badge, cn } from 'ui'

import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { SUITE_MODULES, type SuiteModuleId } from 'lib/api/saas/suite-launch-shared'

import { useDesignLaunch } from './useDesignLaunch'
import { useDiscussLaunch } from './useDiscussLaunch'
import { useSuiteLaunch } from './useSuiteLaunch'

const MODULE_ICONS: Record<SuiteModuleId, React.ReactNode> = {
  files: <FolderOpen size={18} className="text-[#0D9488]" />,
  docs: <FileText size={18} className="text-[#2563EB]" />,
  sheets: <FileSpreadsheet size={18} className="text-[#16A34A]" />,
  presentations: <Presentation size={18} className="text-[#9333EA]" />,
  meetings: <Video size={18} className="text-[#DC2626]" />,
  mail: <Mail size={18} className="text-[#0EA5E9]" />,
  calendar: <Calendar size={18} className="text-[#F97316]" />,
}

const MODULE_ACCENTS: Record<SuiteModuleId, string> = {
  files: 'bg-[#0D9488]/10',
  docs: 'bg-[#2563EB]/10',
  sheets: 'bg-[#16A34A]/10',
  presentations: 'bg-[#9333EA]/10',
  meetings: 'bg-[#DC2626]/10',
  mail: 'bg-[#0EA5E9]/10',
  calendar: 'bg-[#F97316]/10',
}

type ModuleTileProps = {
  id: SuiteModuleId
  label: string
  description: string
  onClick: () => void
  loading?: boolean
}

const ModuleTile = ({ id, label, description, onClick, loading = false }: ModuleTileProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className={cn(
      'group relative flex flex-col gap-3 rounded-xl border bg-surface-100 p-4 text-left transition-all duration-150',
      'hover:-translate-y-0.5 hover:border-foreground-muted hover:shadow-md'
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className={cn('rounded-lg p-2', MODULE_ACCENTS[id])}>{MODULE_ICONS[id]}</div>
      {loading ? <span className="text-[10px] text-foreground-lighter">Opening…</span> : null}
    </div>
    <div className="space-y-0.5">
      <h3 className="text-sm font-medium text-foreground">{label}</h3>
      <p className="text-xs leading-snug text-foreground-light">{description}</p>
    </div>
  </button>
)

export const WorkspaceLauncher = () => {
  const { ref } = useParams()
  const { data: project } = useSelectedProjectQuery()
  const { data: organization } = useSelectedOrganizationQuery()

  const { launch: launchWorkspace, isLaunching: isLaunchingHome } = useSuiteLaunch()
  const { launch: launchDesign, isLaunching: isLaunchingDesign } = useDesignLaunch()
  const { launch: launchDiscuss, isLaunching: isLaunchingDiscuss } = useDiscussLaunch()
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [activeModule, setActiveModule] = useState<SuiteModuleId | 'home' | 'discuss' | null>(null)

  const openModule = async (moduleId: SuiteModuleId) => {
    setLaunchError(null)
    setActiveModule(moduleId)

    if (
      moduleId === 'presentations' &&
      process.env.NEXT_PUBLIC_WORKSPACE_SLIDES_VIA_DESIGN === 'true'
    ) {
      const design = await launchDesign()
      setActiveModule(null)
      if (!design.ok) {
        setLaunchError(design.message ?? 'Could not open Presentations in Design.')
        return
      }
      if (design.url) window.location.assign(design.url)
      return
    }

    const result = await launchWorkspace(moduleId)
    setActiveModule(null)

    if (!result.ok) {
      setLaunchError(result.message ?? 'Could not open that module.')
      return
    }
    if (result.url) window.location.assign(result.url)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('open') !== 'mail') return

    void (async () => {
      setActiveModule('mail')
      const result = await launchWorkspace('mail')
      setActiveModule(null)
      if (result.ok && result.url) {
        window.location.assign(result.url)
      } else if (!result.ok) {
        setLaunchError(result.message ?? 'Could not open Mail.')
      }
    })()
  }, [launchWorkspace])

  const openHome = async () => {
    setLaunchError(null)
    setActiveModule('home')
    const result = await launchWorkspace()
    setActiveModule(null)
    if (!result.ok) {
      setLaunchError(result.message ?? 'Could not open Workspace.')
      return
    }
    if (result.url) window.location.assign(result.url)
  }

  const openDiscuss = async () => {
    setLaunchError(null)
    setActiveModule('discuss')
    const result = await launchDiscuss()
    setActiveModule(null)
    if (!result.ok) {
      setLaunchError(result.message ?? `Could not open ${ECOSYSTEM_PRODUCTS.discuss.name}.`)
      return
    }
    if (result.url) window.location.assign(result.url)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-8 lg:px-8">
      <div className="mb-6 space-y-2">
        <Badge variant="default">
          {organization?.name || 'Organization'} / {project?.name || ref}
        </Badge>
        <div className="flex items-center gap-2">
          <LayoutGrid size={20} className="text-[#3B8FD6]" />
          <h1 className="text-2xl font-medium tracking-tight">
            {ECOSYSTEM_PRODUCTS.workspace.name}
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-foreground-light">
          {ECOSYSTEM_PRODUCTS.workspace.description} Mail opens {ECOSYSTEM_PRODUCTS.email.name};{' '}
          {ECOSYSTEM_PRODUCTS.discuss.descriptor.toLowerCase()} stays in{' '}
          {ECOSYSTEM_PRODUCTS.discuss.name}.
        </p>
      </div>

      {launchError && (
        <div className="mb-4 rounded-lg border border-destructive-400 bg-destructive-200 px-3 py-2 text-xs text-foreground">
          {launchError}
        </div>
      )}

      <section aria-label="Workspace home" className="mb-8">
        <button
          type="button"
          onClick={() => void openHome()}
          disabled={isLaunchingHome || isLaunchingDesign}
          className="inline-flex items-center gap-2 rounded-lg border bg-surface-100 px-4 py-2 text-sm font-medium transition hover:border-foreground-muted hover:shadow-sm"
        >
          {isLaunchingHome
            ? `Opening ${ECOSYSTEM_PRODUCTS.workspace.name}…`
            : ECOSYSTEM_PRODUCTS.workspace.openHomeLabel}
        </button>
      </section>

      <section aria-label="Workspace modules">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-light">
          Open a module
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SUITE_MODULES.map((mod) => (
            <ModuleTile
              key={mod.id}
              id={mod.id}
              label={mod.label}
              description={mod.description}
              onClick={() => void openModule(mod.id)}
              loading={activeModule === mod.id}
            />
          ))}
        </div>
      </section>

      <p className="mt-6 text-xs text-foreground-lighter">
        Need visual posts and brand assets? Use{' '}
        <button
          type="button"
          className="text-[#3B8FD6] underline"
          onClick={() => void launchDesign().then((r) => r.ok && r.url && window.location.assign(r.url))}
          disabled={isLaunchingDesign}
        >
          {ECOSYSTEM_PRODUCTS.design.name}
        </button>{' '}
        from the project home. {ECOSYSTEM_PRODUCTS.discuss.descriptor} for this project lives in{' '}
        <button
          type="button"
          className="text-[#3B8FD6] underline"
          onClick={() => void openDiscuss()}
          disabled={isLaunchingDiscuss}
        >
          {ECOSYSTEM_PRODUCTS.discuss.name}
        </button>
        .
      </p>
    </div>
  )
}
