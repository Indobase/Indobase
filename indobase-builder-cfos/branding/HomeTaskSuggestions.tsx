import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Merchant home: left admin rail, setup cards, right Ask panel.
 * Copied into CFOS AppShell by rebrand. Self-contained (no CSS module).
 */
type TaskSuggestion = {
  id: string
  label: string
  description: string
  prompt: string
  cta: string
  art: 'store' | 'website' | 'payments' | 'domain' | 'app' | 'booking'
  sidekick: { title: string; body: string; paths: Array<{ label: string; prompt: string }> }
}

const SUGGESTIONS: TaskSuggestion[] = [
  {
    id: 'launch-store',
    label: 'Add your first products',
    description: 'Sell a catalog with cart and checkout — not a brochure.',
    cta: 'Add products',
    art: 'store',
    prompt:
      'I want to launch an online store. Build a complete shop with products, cart, checkout, customer accounts, orders, and admin. Infer the rest and start building.',
    sidekick: {
      title: 'Add your first products',
      body: 'Tell me what you sell and the prices. I will build the shop, then you go live.',
      paths: [
        { label: 'Build the shop now', prompt: 'I want to launch an online store. Build a complete shop with products, cart, checkout, customer accounts, orders, and admin. Infer the rest and start building.' },
        { label: 'I have a menu already', prompt: 'I have a priced menu. Build the store around those products and remove any grocery placeholders.' },
      ],
    },
  },
  {
    id: 'store-design',
    label: 'Choose your store design',
    description: 'Generate a custom look, start from a site, or edit what you have.',
    cta: 'Choose theme',
    art: 'website',
    prompt: 'Choose a store design for my business. Generate a custom look that matches what I sell.',
    sidekick: {
      title: 'Choose your store design',
      body: 'First impressions matter. Three ways forward:',
      paths: [
        { label: 'Generate a custom design', prompt: 'Generate a custom store design for my business from what I already told you. Make it look live-ready.' },
        { label: 'Start from a ready website', prompt: 'I want to launch a website for my brand. Make it look live-ready and publish when it is ready.' },
        { label: 'Edit the current design', prompt: 'Edit the current site design. Tighten the hero, brand colors, and product grid.' },
      ],
    },
  },
  {
    id: 'payments',
    label: 'Set up payments',
    description: 'Connect Razorpay or Stripe when you are ready to take money.',
    cta: 'Activate payments',
    art: 'payments',
    prompt: 'Set up payments with Razorpay or Stripe for my business.',
    sidekick: {
      title: 'Set up payments',
      body: 'Checkout stays on Indobase. You bring your gateway after KYC — nothing is invented here.',
      paths: [{ label: 'Connect a gateway', prompt: 'Set up payments with Razorpay or Stripe for my business.' }],
    },
  },
  {
    id: 'domain',
    label: 'Get a custom domain',
    description: 'Use an Indobase subdomain now, then attach a domain you own.',
    cta: 'Find a domain',
    art: 'domain',
    prompt: 'Get a custom domain for my business on Indobase.',
    sidekick: {
      title: 'Get a custom domain',
      body: 'Live first on an Indobase URL, then attach a domain you already own.',
      paths: [{ label: 'Help me with a domain', prompt: 'Get a custom domain for my business on Indobase.' }],
    },
  },
  {
    id: 'launch-saas',
    label: 'Launch an app',
    description: 'Customer accounts and saved data, ready for first users.',
    cta: 'Build an app',
    art: 'app',
    prompt: 'I want to launch a SaaS app with customer accounts and saved data. Infer the rest and start building.',
    sidekick: {
      title: 'Launch an app',
      body: 'Name the product and who it is for. I will build sign-in and a workspace shell.',
      paths: [{ label: 'Build the app', prompt: 'I want to launch a SaaS app with customer accounts and saved data. Infer the rest and start building.' }],
    },
  },
  {
    id: 'launch-booking',
    label: 'Take bookings',
    description: 'Let customers reserve times without a spreadsheet.',
    cta: 'Build booking',
    art: 'booking',
    prompt: 'I want to launch a booking business so customers can reserve times. Infer the rest and start building.',
    sidekick: {
      title: 'Take bookings',
      body: 'Tell me the service and city. I will build reservation flow.',
      paths: [{ label: 'Build booking', prompt: 'I want to launch a booking business so customers can reserve times. Infer the rest and start building.' }],
    },
  },
]

const NAV = [
  { id: 'home', label: 'Home', group: 'main' },
  { id: 'orders', label: 'Orders', group: 'main', prompt: "Show me today's orders." },
  { id: 'products', label: 'Products', group: 'main', prompt: 'Show my products and help me add or update them.' },
  { id: 'customers', label: 'Customers', group: 'main', prompt: 'Show my customers and enquiries.' },
  { id: 'analytics', label: 'Analytics', group: 'main', prompt: 'Summarize how my business is doing.' },
  { id: 'online-store', label: 'Online Store', group: 'channels', prompt: 'Open my live site and help me improve the storefront.' },
  { id: 'payments', label: 'Payments', group: 'channels', prompt: 'Set up payments with Razorpay or Stripe for my business.' },
  { id: 'domain', label: 'Domain', group: 'channels', prompt: 'Get a custom domain for my business on Indobase.' },
  { id: 'settings', label: 'Settings', group: 'footer', prompt: 'Help me with settings.' },
]

const DEFAULT_ASK = {
  title: 'Ask Indobase',
  body: 'Describe the business. I will build a preview, then you go live. Payments stay disconnected until you connect a gateway.',
  paths: [] as Array<{ label: string; prompt: string }>,
}

function Art({ kind }: { kind: TaskSuggestion['art'] }) {
  const common = { width: 132, height: 88, viewBox: '0 0 132 88', 'aria-hidden': true as const }
  if (kind === 'store') {
    return (
      <svg {...common}>
        <rect x="18" y="28" width="96" height="48" rx="10" fill="#d7e8f7" />
        <rect x="30" y="16" width="72" height="18" rx="6" fill="#3B8FD6" />
        <rect x="38" y="44" width="22" height="22" rx="4" fill="#fff" />
        <rect x="72" y="44" width="22" height="22" rx="4" fill="#fff" />
      </svg>
    )
  }
  if (kind === 'website') {
    return (
      <svg {...common}>
        <rect x="22" y="14" width="88" height="60" rx="10" fill="#eeeae6" />
        <rect x="32" y="24" width="48" height="8" rx="4" fill="#1a1a1a" />
        <rect x="32" y="38" width="68" height="6" rx="3" fill="#c9c4bd" />
        <rect x="44" y="52" width="28" height="14" rx="4" fill="#3B8FD6" />
      </svg>
    )
  }
  if (kind === 'payments') {
    return (
      <svg {...common}>
        <rect x="24" y="28" width="84" height="40" rx="10" fill="#e8eef4" />
        <rect x="36" y="40" width="22" height="14" rx="4" fill="#1a1a1a" />
        <rect x="64" y="40" width="22" height="14" rx="4" fill="#3B8FD6" />
        <rect x="92" y="40" width="8" height="14" rx="2" fill="#c5d0dc" />
      </svg>
    )
  }
  if (kind === 'domain') {
    return (
      <svg {...common}>
        <rect x="28" y="22" width="76" height="48" rx="12" fill="#e7f3ea" />
        <rect x="40" y="38" width="52" height="10" rx="5" fill="#2f6f45" />
      </svg>
    )
  }
  if (kind === 'app') {
    return (
      <svg {...common}>
        <rect x="28" y="12" width="76" height="64" rx="12" fill="#e8eef4" />
        <rect x="40" y="24" width="52" height="10" rx="5" fill="#3B8FD6" />
        <rect x="40" y="42" width="36" height="8" rx="4" fill="#c5d0dc" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="26" y="18" width="80" height="56" rx="10" fill="#f3efe6" />
      <rect x="38" y="30" width="16" height="16" rx="4" fill="#3B8FD6" />
      <rect x="58" y="30" width="16" height="16" rx="4" fill="#d8d0c0" />
      <rect x="78" y="30" width="16" height="16" rx="4" fill="#d8d0c0" />
    </svg>
  )
}

const SHELL_CSS = `
.ib-merchant { position: relative; width: 100%; min-height: min(72vh, 44rem); display: grid; grid-template-columns: 220px minmax(0,1fr) min(400px, 36vw); background: #f1f2f4; color: #1a1a1a; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 0 rgba(26,28,29,.04); }
@media (max-width: 960px) { .ib-merchant { grid-template-columns: 1fr; } .ib-merchant-nav, .ib-merchant-ask { display: none; } }
.ib-merchant-nav { background: #ebebeb; padding: 1rem .75rem; display: flex; flex-direction: column; gap: .15rem; border-right: 1px solid #e3e4e5; }
.ib-merchant-nav .footer { margin-top: auto; }
.ib-merchant-nav button { appearance: none; border: 0; background: transparent; text-align: left; border-radius: 10px; padding: .5rem .7rem; font: 650 13px/1.3 system-ui,sans-serif; color: #303030; cursor: pointer; }
.ib-merchant-nav button[data-id="settings"] { display: inline-flex; align-items: center; gap: .45rem; }
.ib-merchant-nav button[data-active="true"] { background: #fff; box-shadow: 0 0 0 1px #e3e4e5 inset; }
.ib-merchant-nav .group { margin: .85rem .7rem .35rem; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #8c9196; }
.ib-merchant-nav .threads { margin-top: auto; padding-top: .75rem; }
.ib-merchant-nav .threads p { margin: 0 .7rem .35rem; font-size: 11px; font-weight: 700; color: #8c9196; text-transform: uppercase; letter-spacing: .04em; }
.ib-merchant-nav .threads button { font-weight: 500; color: #616161; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ib-merchant-main { padding: 1.75rem 1.5rem 1.5rem; overflow: auto; background: #f8f8f8; }
.ib-merchant-main h2 { margin: 0 0 .35rem; font-size: 1.75rem; letter-spacing: -.03em; font-weight: 750; }
.ib-merchant-main .sub { margin: 0 0 1.25rem; color: #616161; font-size: 15px; }
.ib-merchant-main ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 1rem; }
@media (max-width: 720px) { .ib-merchant-main ul { grid-template-columns: 1fr; } }
.ib-merchant-main li > button.card { appearance: none; width: 100%; text-align: left; cursor: pointer; border: 0; border-radius: 16px; background: #fff; box-shadow: 0 1px 0 rgba(26,28,29,.05), 0 4px 16px rgba(26,28,29,.06); padding: 1.05rem 1.1rem .95rem; min-height: 15rem; display: flex; flex-direction: column; gap: .4rem; color: #1a1a1a; }
.ib-merchant-main .art { flex: 1; display: flex; align-items: center; justify-content: center; background: #f7f7f8; border-radius: 12px; }
.ib-merchant-main .label { font-size: 15px; font-weight: 650; letter-spacing: -.02em; }
.ib-merchant-main .desc { font-size: 13px; line-height: 1.4; color: #616161; }
.ib-merchant-main .cta { align-self: flex-start; margin-top: .3rem; border-radius: 10px; background: #1a1a1a; color: #fff; font-size: 12px; font-weight: 650; padding: .4rem .75rem; }
.ib-merchant-ask { background: #fff; border-left: 1px solid #e3e4e5; display: flex; flex-direction: column; min-height: 0; }
.ib-merchant-ask header { display: flex; align-items: center; justify-content: space-between; padding: .85rem 1rem; border-bottom: 1px solid #eee; font-weight: 650; font-size: 14px; }
.ib-merchant-ask .body { flex: 1; padding: 1rem 1.05rem; overflow: auto; font-size: 14px; line-height: 1.55; color: #303030; }
.ib-merchant-ask .paths { display: flex; flex-direction: column; gap: .45rem; margin-top: 1rem; }
.ib-merchant-ask .paths button { appearance: none; text-align: left; border: 1px solid #e3e4e5; background: #f8f8f8; border-radius: 12px; padding: .7rem .8rem; cursor: pointer; font: 650 13px/1.35 system-ui,sans-serif; }
.ib-merchant-ask .paths button:hover { background: #fff; border-color: #3B8FD6; }
.ib-merchant-ask form { display: flex; align-items: center; gap: .4rem; padding: .75rem; border-top: 1px solid #eee; }
.ib-merchant-ask .ib-attach { appearance: none; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 999px; border: 1px solid #e3e4e5; background: #fff; color: #1a1a1a; font: 700 18px/1 system-ui,sans-serif; cursor: pointer; }
.ib-merchant-ask input { flex: 1; border: 1px solid #e3e4e5; border-radius: 999px; padding: .65rem .9rem; font: inherit; font-size: 14px; }
.ib-merchant-ask form button[type="submit"] { appearance: none; border: 0; border-radius: 999px; background: #1a1a1a; color: #fff; padding: .55rem .85rem; font-weight: 650; cursor: pointer; }
.ib-merchant-ask .close { appearance: none; border: 0; background: transparent; cursor: pointer; font-size: 18px; color: #616161; }
.ib-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
`

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.5 1.5h3l.4 1.6a5 5 0 0 1 1.6.9l1.6-.5 1.5 2.6-1.2 1.2a5 5 0 0 1 0 1.8l1.2 1.2-1.5 2.6-1.6-.5a5 5 0 0 1-1.6.9l-.4 1.6h-3l-.4-1.6a5 5 0 0 1-1.6-.9l-1.6.5L1.4 10l1.2-1.2a5 5 0 0 1 0-1.8L1.4 5.8 2.9 3.2l1.6.5a5 5 0 0 1 1.6-.9L6.5 1.5zm1.5 4.2A2.3 2.3 0 1 0 10.3 8 2.3 2.3 0 0 0 8 5.7z"
      />
    </svg>
  )
}

export default function HomeTaskSuggestions({
  onPick,
}: {
  onPick: (prompt: string) => void
}) {
  const visible = useMemo(() => SUGGESTIONS, [])
  const [nav, setNav] = useState('home')
  const [ask, setAsk] = useState('')
  const [brief, setBrief] = useState(DEFAULT_ASK)
  const [threads, setThreads] = useState<string[]>([])
  const [askOpen, setAskOpen] = useState(true)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('indobase-merchant-os')
    document.documentElement.setAttribute('data-ib-surface', 'home')
    document.documentElement.setAttribute('data-ib-ask-open', askOpen ? '1' : '0')
    return () => {
      document.documentElement.classList.remove('indobase-merchant-os')
      document.documentElement.removeAttribute('data-ib-surface')
    }
  }, [askOpen])

  useEffect(() => {
    const onSearch = (ev: Event) => {
      const q = String((ev as CustomEvent<{ q?: string }>).detail?.q || '').trim()
      if (!q) return
      const match = NAV.find((item) => item.label.toLowerCase() === q.toLowerCase() || item.id === q.toLowerCase())
      if (match) {
        setNav(match.id)
        if (match.id === 'home') setBrief(DEFAULT_ASK)
        else if ('prompt' in match && match.prompt) onPick(match.prompt)
        return
      }
      setAskOpen(true)
      onPick(q)
    }
    const onAsk = (ev: Event) => {
      const open = (ev as CustomEvent<{ open?: boolean }>).detail?.open
      if (typeof open === 'boolean') setAskOpen(open)
    }
    const onAction = (ev: Event) => {
      const id = (ev as CustomEvent<{ id?: string }>).detail?.id
      if (id === 'settings') {
        setNav('settings')
        onPick('Help me with settings.')
      }
    }
    window.addEventListener('indobase:search', onSearch)
    window.addEventListener('indobase:ask-toggle', onAsk)
    window.addEventListener('indobase:run-action', onAction)
    return () => {
      window.removeEventListener('indobase:search', onSearch)
      window.removeEventListener('indobase:ask-toggle', onAsk)
      window.removeEventListener('indobase:run-action', onAction)
    }
  }, [onPick])

  const send = (prompt: string) => {
    const text = prompt.trim()
    if (!text) return
    setThreads((prev) => [text.slice(0, 48), ...prev.filter((t) => t !== text.slice(0, 48))].slice(0, 5))
    onPick(text)
    setAsk('')
  }

  return (
    <div className="ib-merchant" aria-label="Business home">
      <style>{SHELL_CSS}</style>
      <nav className="ib-merchant-nav" aria-label="Business">
        {(['main', 'channels', 'footer'] as const).map((group) => (
          <div key={group} className={group === 'footer' ? 'footer' : undefined}>
            {group === 'channels' ? <p className="group">Sales channels</p> : null}
            {NAV.filter((item) => item.group === group).map((item) => (
              <button
                key={item.id}
                type="button"
                data-id={item.id}
                data-active={nav === item.id ? 'true' : 'false'}
                onClick={() => {
                  setNav(item.id)
                  if (item.id === 'home') {
                    setBrief(DEFAULT_ASK)
                    return
                  }
                  if ('prompt' in item && item.prompt) send(item.prompt)
                }}
              >
                {item.id === 'settings' ? <GearIcon /> : null}
                {item.label}
              </button>
            ))}
          </div>
        ))}
        {threads.length ? (
          <div className="threads">
            <p>Recent</p>
            {threads.map((t) => (
              <button key={t} type="button" onClick={() => send(t)}>
                {t}
              </button>
            ))}
          </div>
        ) : null}
      </nav>
      <section className="ib-merchant-main">
        <h2>You've got a business to launch.</h2>
        <p className="sub">What do you want to work on next?</p>
        <ul>
          {visible.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                className="card"
                onClick={() => {
                  setBrief(suggestion.sidekick)
                  setNav('home')
                  setAskOpen(true)
                }}
              >
                <div className="art">
                  <Art kind={suggestion.art} />
                </div>
                <span className="label">{suggestion.label}</span>
                <span className="desc">{suggestion.description}</span>
                <span className="cta">{suggestion.cta}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {askOpen ? (
      <aside className="ib-merchant-ask" aria-label={brief.title}>
        <header>
          {brief.title}
          <button
            type="button"
            className="close"
            aria-label="Close Ask"
            onClick={() => {
              setAskOpen(false)
              document.documentElement.setAttribute('data-ib-ask-open', '0')
            }}
          >
            ×
          </button>
        </header>
        <div className="body">
          <p>{brief.body}</p>
          {brief.paths.length ? (
            <div className="paths">
              {brief.paths.map((path) => (
                <button key={path.label} type="button" onClick={() => send(path.prompt)}>
                  {path.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(ask || brief.paths[0]?.prompt || '')
          }}
        >
          <input
            ref={fileRef}
            className="ib-visually-hidden"
            type="file"
            multiple
            aria-hidden="true"
            onChange={(e) => {
              const names = [...(e.target.files || [])].map((f) => f.name)
              if (!names.length) return
              setAsk((prev) => `${prev ? `${prev} ` : ''}Attached: ${names.join(', ')}`)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="ib-attach"
            aria-label="Attachment"
            title="Attachment"
            onClick={() => fileRef.current?.click()}
          >
            +
          </button>
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask anything…"
            aria-label="Ask Indobase"
          />
          <button type="submit">Send</button>
        </form>
      </aside>
      ) : null}
    </div>
  )
}
