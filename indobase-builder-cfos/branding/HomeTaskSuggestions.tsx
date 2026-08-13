import { useMemo } from 'react'
import {
  AppWindow,
  Briefcase,
  Calendar,
  Newspaper,
  ShoppingBag,
  Storefront,
  type Icon,
} from '@phosphor-icons/react'

/**
 * Home launch tiles — business intents, not architecture.
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
    id: 'launch-store',
    label: 'Store',
    description: 'Sell online',
    icon: Storefront,
    prompt:
      'I want to launch an online store. Build a complete shop with products, cart, checkout, customer accounts, orders, and admin. Infer the rest and start building.',
  },
  {
    id: 'launch-saas',
    label: 'SaaS',
    description: 'Launch app',
    icon: AppWindow,
    prompt: 'I want to launch a SaaS app with customer accounts and saved data. Infer the rest and start building.',
  },
  {
    id: 'launch-landing',
    label: 'Website',
    description: 'Grow brand',
    icon: Newspaper,
    prompt: 'I want to launch a website for my brand. Make it look live-ready and publish when it is ready.',
  },
  {
    id: 'launch-booking',
    label: 'Booking',
    description: 'Take bookings',
    icon: Calendar,
    prompt: 'I want to launch a booking business so customers can reserve times. Infer the rest and start building.',
  },
  {
    id: 'launch-ordering',
    label: 'Ordering',
    description: 'Take orders',
    icon: ShoppingBag,
    prompt: 'I want to launch an ordering site so customers can order and pay. Infer the rest and start building.',
  },
  {
    id: 'launch-agency',
    label: 'Agency',
    description: 'Get clients',
    icon: Briefcase,
    prompt: 'I want to launch an agency website to get clients. Infer the rest and start building.',
  },
]

function SuggestionCard({
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
        className="press group flex w-full cursor-pointer flex-col gap-1 rounded-xl border border-kumo-line/60 bg-kumo-fill/40 px-3 py-3 text-left transition-colors hover:bg-kumo-tint"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-kumo-fill text-kumo-subtle transition-colors group-hover:text-kumo-default">
          {icon}
        </span>
        <span className="block text-[13px] leading-[18px] font-medium tracking-[-0.25px] text-kumo-default">
          {label}
        </span>
        <span className="block text-[12px] leading-4 tracking-[-0.2px] text-kumo-subtle">{description}</span>
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
    <section aria-label="What do you want to launch?" className="flex flex-col gap-2">
      <h3 className="px-1 text-[12px] font-medium uppercase tracking-[0.06em] text-kumo-inactive">
        Build with AI
      </h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            icon={<suggestion.icon size={16} />}
            label={suggestion.label}
            description={suggestion.description}
            onClick={() => onPick(suggestion.prompt)}
          />
        ))}
      </ul>
      <p className="px-1 pt-1 text-[12px] leading-4 text-kumo-subtle">Or describe anything… “I want to launch a…”</p>
    </section>
  )
}
