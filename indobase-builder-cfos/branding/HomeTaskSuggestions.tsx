import { useMemo } from 'react'
import { AppWindow, Storefront, Newspaper, type Icon } from '@phosphor-icons/react'

/**
 * Home launch tiles — production outcomes, not CFOS office templates.
 * Copied over workshop-frontend HomeTaskSuggestions by rebrand-cloudflare-os.mjs.
 */
type TaskSuggestion = {
  id: string
  label: string
  description: string
  prompt: string
  icon: Icon
}

const SUGGESTIONS: TaskSuggestion[] = [
  {
    id: 'launch-saas',
    label: 'Launch a SaaS',
    description: 'Customer accounts and saved data, then go live',
    icon: AppWindow,
    prompt:
      'Launch a production-ready SaaS with customer accounts and saved data. After I am signed in, POST /api/os/apps/launch { appType: "saas", production: true } — do not call ensure* or launchBusiness yourself.',
  },
  {
    id: 'launch-store',
    label: 'Launch a store',
    description: 'Catalog, cart, and checkout on Indobase',
    icon: Storefront,
    prompt:
      'Launch a production-ready online store. After I am signed in, POST /api/os/apps/launch { appType: "ecommerce", production: true } — do not call guidedBackend or launchBusiness yourself.',
  },
  {
    id: 'launch-landing',
    label: 'Launch a landing page',
    description: 'A live marketing site on your Indobase URL',
    icon: Newspaper,
    prompt:
      'Launch a production-ready landing page. After I am signed in, POST /api/os/apps/launch { appType: "landing", production: true } — do not call launchBusiness yourself.',
  },
]

function SuggestionRow({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="press group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-kumo-tint"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-kumo-fill text-kumo-subtle transition-colors group-hover:text-kumo-default">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-[18px] font-medium tracking-[-0.25px] text-kumo-default">
            {label}
          </span>
          <span className="block truncate text-[12px] leading-4 tracking-[-0.2px] text-kumo-subtle">
            {description}
          </span>
        </span>
      </button>
    </li>
  )
}

export default function HomeTaskSuggestions({
  onPick,
}: {
  onPick: (prompt: string) => void
}) {
  const visible = useMemo(() => SUGGESTIONS, [])

  return (
    <section aria-label="Launch a production application" className="flex flex-col gap-1">
      <h3 className="px-1 pb-1 text-[12px] font-medium uppercase tracking-[0.06em] text-kumo-inactive">
        Launch
      </h3>
      <ul className="flex flex-col gap-0.5">
        {visible.map((suggestion) => (
          <SuggestionRow
            key={suggestion.id}
            icon={<suggestion.icon size={16} />}
            label={suggestion.label}
            description={suggestion.description}
            onClick={() => onPick(suggestion.prompt)}
          />
        ))}
      </ul>
    </section>
  )
}
