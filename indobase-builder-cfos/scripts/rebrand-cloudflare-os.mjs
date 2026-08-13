#!/usr/bin/env node
/**
 * Indobase UI rebrand for the local Cloudflare OS clone.
 *
 * Scope: user-visible chrome only (titles, logos, brand colors, marketing copy).
 * Does NOT change Workers APIs, gatekeeper RPC contracts, auth flow internals,
 * or package/import paths.
 *
 * Safe to re-run after `fetch-cloudflare-os.sh`.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OS = process.env.CLOUDFLARE_OS_DIR || join(ROOT, 'upstream/cloudflare-os')
const BRAND = join(ROOT, 'branding')
const SITE_NAME = 'Indobase Builder'
const BRAND_BLUE = '#3B8FD6'
const BRAND_BLUE_HOVER = '#2F7AB8'
const BRAND_BLUE_DARK = '#2A6FA8'
const BRAND_BLUE_DARK_HOVER = '#245F90'
const BRAND_BLUE_TEXT_DARK = '#7BB5E3'

function mustExist(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`)
    process.exit(1)
  }
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function replaceOnce(text, from, to, path) {
  if (!text.includes(from)) {
    // Already rebranded or upstream drifted — warn but continue.
    if (!text.includes(to)) {
      console.warn(`  skip (not found): ${path} ← ${JSON.stringify(from).slice(0, 60)}`)
    }
    return text
  }
  return text.replace(from, to)
}

function replaceAll(text, from, to) {
  return text.split(from).join(to)
}

mustExist(OS, 'Cloudflare OS clone')
mustExist(BRAND, 'branding assets')

console.log(`Rebranding Cloudflare OS UI → Indobase at ${OS}`)

// --- Assets ---
copyFileSync(join(BRAND, 'favicon.svg'), join(OS, 'packages/workshop-frontend/public/favicon.svg'))
copyFileSync(join(BRAND, 'IndobaseMark.tsx'), join(OS, 'packages/workshop-frontend/src/components/IndobaseMark.tsx'))
copyFileSync(join(BRAND, 'NOTICE'), join(OS, 'INDOBASE-NOTICE'))

// --- Site name (cascades through useSiteName / document titles) ---
{
  const path = join(OS, 'packages/workshop-shared/src/api.ts')
  let text = read(path)
  text = replaceAll(text, 'export const DEFAULT_SITE_NAME = "Cloudflare OS";', `export const DEFAULT_SITE_NAME = "${SITE_NAME}";`)
  text = replaceAll(text, 'default Cloudflare OS mark', 'default Indobase mark')
  write(path, text)
  console.log('  DEFAULT_SITE_NAME →', SITE_NAME)
}

// --- HTML title ---
{
  const path = join(OS, 'packages/workshop-frontend/index.html')
  let text = read(path)
  text = replaceAll(text, '<title>Cloudflare OS</title>', `<title>${SITE_NAME}</title>`)
  write(path, text)
}

// --- Theme accent (auth / primary CTAs → Indobase brand blue) ---
{
  const path = join(OS, 'packages/workshop-frontend/src/theme.ts')
  let text = read(path)
  text = replaceAll(text, "export const DEFAULT_ACCENT_COLOR = '#ff4801'", `export const DEFAULT_ACCENT_COLOR = '${BRAND_BLUE}'`)
  write(path, text)
}

{
  const path = join(OS, 'packages/workshop-frontend/src/styles.css')
  let text = read(path)
  text = replaceAll(text, 'The brand orange\n     is reserved for *intent only*', 'The brand accent\n     is reserved for *intent only*')
  text = replaceAll(text, '/* Brand — warm orange accent (intent only) */', '/* Brand — Indobase blue accent (intent only) */')
  // Light mode brand
  text = replaceAll(text, '--color-kumo-brand: #ff4801;', `--color-kumo-brand: ${BRAND_BLUE};`)
  text = replaceAll(text, '--color-kumo-brand-hover: #e03f00;', `--color-kumo-brand-hover: ${BRAND_BLUE_HOVER};`)
  text = replaceAll(text, '--text-color-kumo-brand: #ff4801;', `--text-color-kumo-brand: ${BRAND_BLUE};`)
  text = replaceAll(text, '--text-color-kumo-link: #ff4801;', `--text-color-kumo-link: ${BRAND_BLUE};`)
  text = replaceAll(text, '--color-accent-100: #ff4801;', `--color-accent-100: ${BRAND_BLUE};`)
  text = replaceAll(text, '--color-accent-200: #ff7038;', `--color-accent-200: #6BADE0;`)
  text = replaceAll(text, '--color-selection-bg: #ffe9e0;', '--color-selection-bg: #e8f3fb;')
  text = replaceAll(text, '--color-selection-text: #ff500a;', `--color-selection-text: ${BRAND_BLUE_HOVER};`)
  text = replaceAll(text, '--color-shadow-accent-light: #ffa683;', '--color-shadow-accent-light: #9ec9ea;')
  text = replaceAll(text, '--color-shadow-accent-dark: #b13200;', `--color-shadow-accent-dark: ${BRAND_BLUE_DARK};`)
  // Dark mode brand (orange → blue)
  text = replaceAll(text, '--color-kumo-brand: #b84e00;', `--color-kumo-brand: ${BRAND_BLUE_DARK};`)
  text = replaceAll(text, '--color-kumo-brand-hover: #a54200;', `--color-kumo-brand-hover: ${BRAND_BLUE_DARK_HOVER};`)
  text = replaceAll(text, '--text-color-kumo-brand: #ff8a5c;', `--text-color-kumo-brand: ${BRAND_BLUE_TEXT_DARK};`)
  text = replaceAll(text, '--text-color-kumo-link: #ff8a5c;', `--text-color-kumo-link: ${BRAND_BLUE_TEXT_DARK};`)
  text = replaceAll(text, '--color-accent-100: #b84e00;', `--color-accent-100: ${BRAND_BLUE_DARK};`)
  text = replaceAll(text, '--color-accent-200: #ff8a5c;', `--color-accent-200: ${BRAND_BLUE_TEXT_DARK};`)
  text = replaceAll(text, '--color-shadow-accent-light: #ff663355;', '--color-shadow-accent-light: #3B8FD655;')
  // Hardcoded orange tint in routes
  write(path, text)
  console.log('  brand colors →', BRAND_BLUE)
}

// Hardcoded orange rgba in a few route files
for (const rel of [
  'packages/workshop-frontend/src/routes/providers.tsx',
  'packages/workshop-frontend/src/routes/gatekeepers.tsx',
]) {
  const path = join(OS, rel)
  if (!existsSync(path)) continue
  let text = read(path)
  text = replaceAll(text, 'rgba(255,72,1,0.10)', 'rgba(59,143,214,0.12)')
  write(path, text)
}

// --- Logo chrome: Hexagon → IndobaseMark in brand positions ---
const logoTargets = [
  {
    file: 'packages/workshop-frontend/src/components/Header.tsx',
    importFrom: "import { Hexagon, List, X } from '@phosphor-icons/react'",
    importTo:
      "import { List, X } from '@phosphor-icons/react'\nimport IndobaseMark from './IndobaseMark'",
    jsxFrom: '<Hexagon size={22} className="text-kumo-brand" weight="bold" />',
    jsxTo: '<IndobaseMark size={22} className="text-kumo-brand" />',
  },
  {
    file: 'packages/workshop-frontend/src/components/AppShell/Sidebar.tsx',
    importFrom: 'Hexagon,',
    importTo: '',
    extraImport: "import IndobaseMark from '../IndobaseMark'\n",
    jsxFrom: '<Hexagon size={20} weight="bold" className="text-kumo-brand shrink-0" />',
    jsxTo: '<IndobaseMark size={20} className="text-kumo-brand shrink-0" />',
  },
  {
    file: 'packages/workshop-frontend/src/LoginPage.tsx',
    importFrom: "import { Hexagon } from '@phosphor-icons/react'",
    importTo: "import IndobaseMark from './components/IndobaseMark'",
    jsxFrom: '<Hexagon size={20} className="text-white" weight="bold" />',
    jsxTo: '<IndobaseMark size={20} className="text-white" />',
  },
  {
    file: 'packages/workshop-frontend/src/SignupPage.tsx',
    importFrom: 'import { Hexagon } from "@phosphor-icons/react";',
    importTo: 'import IndobaseMark from "./components/IndobaseMark";',
    jsxFrom: '<Hexagon size={20} className="text-white" weight="bold" />',
    jsxTo: '<IndobaseMark size={20} className="text-white" />',
  },
  {
    file: 'packages/workshop-frontend/src/OnboardingWizard.tsx',
    importFrom: 'Hexagon,',
    importTo: '',
    extraImport: "import IndobaseMark from './components/IndobaseMark'\n",
    jsxFrom: '<Hexagon size={22} className="text-kumo-brand" weight="bold" />',
    jsxTo: '<IndobaseMark size={22} className="text-kumo-brand" />',
  },
  {
    file: 'packages/workshop-frontend/src/GadgetUseView.tsx',
    importFrom: "import { Hexagon } from '@phosphor-icons/react'",
    importTo: "import IndobaseMark from './components/IndobaseMark'",
    jsxFrom: '<Hexagon size={22} className="text-kumo-brand" weight="bold" />',
    jsxTo: '<IndobaseMark size={22} className="text-kumo-brand" />',
  },
  {
    file: 'packages/workshop-frontend/src/AdminPage.tsx',
    importFrom: "import { Hexagon, ShieldWarning, UserPlus } from '@phosphor-icons/react'",
    importTo:
      "import { ShieldWarning, UserPlus } from '@phosphor-icons/react'\nimport IndobaseMark from './components/IndobaseMark'",
    jsxFrom: '<Hexagon size={32} weight="bold" className="text-kumo-brand" />',
    jsxTo: '<IndobaseMark size={32} className="text-kumo-brand" />',
  },
]

for (const t of logoTargets) {
  const path = join(OS, t.file)
  if (!existsSync(path)) continue
  let text = read(path)
  if (t.importFrom && t.importTo !== undefined) {
    text = replaceOnce(text, t.importFrom, t.importTo, t.file)
  }
  if (t.extraImport && !text.includes('IndobaseMark')) {
    // Insert after first import block line
    const idx = text.indexOf('\n')
    text = text.slice(0, idx + 1) + t.extraImport + text.slice(idx + 1)
  }
  if (t.jsxFrom) text = replaceAll(text, t.jsxFrom, t.jsxTo)
  write(path, text)
}
console.log('  chrome logos → IndobaseMark')

// GadgetEditor has Hexagon in import list — patch carefully
{
  const path = join(OS, 'packages/workshop-frontend/src/GadgetEditor.tsx')
  if (existsSync(path)) {
    let text = read(path)
    if (!text.includes('IndobaseMark')) {
      text = text.replace(
        /import \{\n([\s\S]*?)Hexagon,\n([\s\S]*?)\} from '@phosphor-icons\/react'/,
        (m, a, b) => `import {\n${a}${b}} from '@phosphor-icons/react'\nimport IndobaseMark from './components/IndobaseMark'`,
      )
    }
    text = replaceAll(
      text,
      '<Hexagon size={22} className="text-kumo-brand" weight="bold" />',
      '<IndobaseMark size={22} className="text-kumo-brand" />',
    )
    write(path, text)
  }
}

// --- Sample / demo copy ---
{
  const path = join(OS, 'packages/workshop-frontend/src/data/sample.ts')
  let text = read(path)
  text = replaceAll(text, "title: 'Workers AI Playground'", "title: 'AI Playground'")
  text = replaceAll(text, "author: { name: 'cloudflare', avatar: 'CF' }", "author: { name: 'indobase', avatar: 'IB' }")
  text = replaceAll(text, 'Visual database explorer for Cloudflare D1', 'Visual database explorer for project databases')
  text = replaceAll(text, 'Manage your Workers KV namespaces with a clean UI', 'Manage your key-value namespaces with a clean UI')
  text = replaceAll(text, 'Route and manage AI API calls through Cloudflare', 'Route and manage AI API calls through the gateway')
  text = replaceAll(text, 'Upload and browse files stored in Cloudflare R2', 'Upload and browse files in object storage')
  write(path, text)
}

{
  const path = join(OS, 'packages/workshop-frontend/src/data/chat.ts')
  let text = read(path)
  text = replaceAll(text, "label: 'Deploying to Cloudflare'", "label: 'Deploying to Indobase'")
  text = replaceAll(text, 'Deployed to slack-summarizer.workers.dev (200ms cold start)', 'Deployed to slack-summarizer preview (200ms cold start)')
  text = replaceAll(text, 'https://slack-summarizer.workers.dev/api/health', 'https://slack-summarizer.indobase.in/api/health')
  text = replaceAll(text, 'using Workers AI (Llama 3.1)', 'using platform AI (Llama 3.1)')
  text = replaceAll(text, 'The app is deployed at `slack-summarizer.workers.dev`', 'The app is deployed at `slack-summarizer.indobase.in`')
  write(path, text)
}

// --- Home landing hero (agentic business OS ICP) ---
{
  const path = join(OS, 'packages/workshop-frontend/src/routes/index.tsx')
  if (existsSync(path)) {
    let text = read(path)
    text = replaceAll(text, 'What are we working on?', 'What do you want to launch?')
    text = replaceAll(text, 'Describe Your Business Idea', 'What do you want to launch?')
    text = replaceAll(
      text,
      'Ask a question, create an output, or create an app that works with your tools and data.',
      'Launch a production-ready application from one prompt.',
    )
    text = replaceAll(
      text,
      'Tell Indobase what you want to build — we’ll create the site, backend, and go live with you.',
      'Launch a production-ready application from one prompt.',
    )
    write(path, text)
    console.log('  home landing hero → launch a production application')
  }
  const suggestionsSrc = join(BRAND, 'HomeTaskSuggestions.tsx')
  const suggestionsDest = join(
    OS,
    'packages/workshop-frontend/src/components/AppShell/HomeTaskSuggestions.tsx',
  )
  if (existsSync(suggestionsSrc) && existsSync(suggestionsDest)) {
    copyFileSync(suggestionsSrc, suggestionsDest)
    console.log('  HomeTaskSuggestions ← Store / SaaS / Website / Booking / Ordering / Agency')
  }
}

// --- User-facing limits messages ---
{
  const path = join(OS, 'packages/workshop-shared/src/limits.ts')
  let text = read(path)
  text = replaceAll(
    text,
    'return `Cloudflare AI Gateway balance is below $${minimum}. Please add credits or use BYOK.`;',
    'return `AI Gateway balance is below $${minimum}. Please add credits or use BYOK.`;',
  )
  text = replaceAll(
    text,
    '"Free usage limit reached. Connect your Cloudflare account or use your own API keys to continue.",',
    '"Free usage limit reached. Connect a cloud account or use your own API keys to continue.",',
  )
  text = replaceAll(
    text,
    '"Free usage limit reached. Connect your Cloudflare account to continue.",',
    '"Free usage limit reached. Connect a cloud account to continue.",',
  )
  write(path, text)
}

// --- Gatekeeper OAuth chrome (user-visible HTML + displayName) ---
{
  const path = join(OS, 'packages/gatekeeper-cloudflare/src/cloudflare.ts')
  let text = read(path)
  text = replaceAll(text, 'return to Cloudflare OS.', `return to ${SITE_NAME}.`)
  text = replaceAll(text, 'return to Cloudflare OS and try again.', `return to ${SITE_NAME} and try again.`)
  text = replaceAll(text, 'Cloudflare Gatekeeper Not Configured', 'Cloud account gatekeeper not configured')
  text = replaceAll(text, 'displayName: "Cloudflare",', 'displayName: "Cloud account",')
  text = replaceAll(text, 'tagline: "Sign in with Cloudflare",', 'tagline: "Sign in with a cloud account",')
  text = replaceAll(
    text,
    '"Sign in with your Cloudflare account. Usage beyond the free tier can be billed to your " +\n' +
      '          "own Cloudflare AI Gateway credits.",',
    '"Sign in with a cloud account. Usage beyond the free tier can be billed to your " +\n' +
      '          "own AI Gateway credits.",',
  )
  write(path, text)
}

// --- Billing UI copy (keep connectAccount('cloudflare') vendor id) ---
function softenBillingCopy(text) {
  const pairs = [
    ['Connect your Cloudflare account to keep building now — usage beyond the free', 'Connect a cloud account to keep building now — usage beyond the free'],
    ['tier is billed to your own Cloudflare AI Gateway credits', 'tier is billed to your own AI Gateway credits'],
    ['Your Cloudflare connection has access to multiple accounts. Choose which one\'s AI', 'Your connection has access to multiple accounts. Choose which one\'s AI'],
    ['Your Cloudflare account is connected', 'Your cloud account is connected'],
    ['Connect Cloudflare', 'Connect cloud account'],
    ['Add credits in Cloudflare', 'Add AI Gateway credits'],
    ['Choose a Cloudflare account', 'Choose a cloud account'],
    ['Your Cloudflare connection has access to multiple accounts. Select the one whose credits', 'Your connection has access to multiple accounts. Select the one whose credits'],
    ['Cloudflare account selected', 'Cloud account selected'],
    ['Failed to start Cloudflare connection', 'Failed to start cloud account connection'],
    ['Cloudflare account', 'Cloud account'],
    ['Connect your Cloudflare account to keep building once your free allowance runs', 'Connect a cloud account to keep building once your free allowance runs'],
    ['out. Usage beyond the free tier is billed to your own Cloudflare AI Gateway', 'out. Usage beyond the free tier is billed to your own AI Gateway'],
    ['Choose which Cloudflare account to bill', 'Choose which cloud account to bill'],
    ['Your connection has access to multiple Cloudflare accounts. Select the one whose', 'Your connection has access to multiple cloud accounts. Select the one whose'],
    ['Please enter your Cloudflare account ID', 'Please enter your cloud account ID'],
    ["cloudflare: 'Cloudflare API token'", "cloudflare: 'Cloud API token'"],
    ['label="Cloudflare Account ID"', 'label="Cloud account ID"'],
    ['Override the default API endpoint (useful for proxies like Cloudflare AI Gateway)', 'Override the default API endpoint (useful for AI gateway proxies)'],
  ]
  for (const [a, b] of pairs) text = replaceAll(text, a, b)
  return text
}

for (const rel of [
  'packages/workshop-frontend/src/components/billing/OutOfCreditsModal.tsx',
  'packages/workshop-frontend/src/components/billing/UsageSettings.tsx',
  'packages/workshop-frontend/src/components/billing/AccountSelectionModal.tsx',
  'packages/workshop-frontend/src/AddModelModal.tsx',
]) {
  const path = join(OS, rel)
  if (!existsSync(path)) continue
  write(path, softenBillingCopy(read(path)))
}

// --- Tests expecting old site name ---
{
  const path = join(OS, 'packages/workshop-frontend/src/useWorkspaceOpen.test.tsx')
  if (existsSync(path)) {
    let text = read(path)
    text = replaceAll(text, 'Cloudflare OS', SITE_NAME)
    write(path, text)
  }
}

// --- Generated blueprint authors (display only) ---
{
  const path = join(OS, 'packages/workshop-backend/src/generated/format-blueprints.ts')
  if (existsSync(path)) {
    let text = read(path)
    text = replaceAll(text, '"name": "Cloudflare"', '"name": "Indobase"')
    text = replaceAll(text, '"id": "agent@cloudflare.com"', '"id": "agent@indobase.in"')
    write(path, text)
  }
}

// --- Remaining user-visible "Cloudflare OS" across gatekeepers / apps ---
{
  const walk = (dir) => {
    const out = []
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.wrangler' || name === 'dist' || name.startsWith('._')) continue
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) out.push(...walk(p))
      else if (/\.(ts|tsx|html)$/.test(name) && name !== 'worker-configuration.d.ts' && !name.startsWith('._')) out.push(p)
    }
    return out
  }
  let files = 0
  let hits = 0
  for (const path of walk(join(OS, 'packages'))) {
    let text = read(path)
    const n = text.split('Cloudflare OS').length - 1
    if (!n) continue
    write(path, replaceAll(text, 'Cloudflare OS', SITE_NAME))
    files++
    hits += n
  }
  if (files) console.log(`  Cloudflare OS → ${SITE_NAME} in ${files} files (${hits} hits)`)
}

// Extra provider / demo copy
for (const [rel, pairs] of [
  [
    'packages/workshop-frontend/src/AddModelModal.tsx',
    [
      ["cloudflare: 'Cloudflare Workers AI'", "cloudflare: 'Cloud AI'"],
      ["cloudflare: 'Workers AI'", "cloudflare: 'Cloud AI'"],
      [
        'description="The Cloud account to bill for Workers AI usage"',
        'description="The cloud account to bill for AI usage"',
      ],
      [
        "'An API token with Workers AI Read + Edit permissions (in the dashboard: Workers AI > Use REST API > Create a Workers AI API Token)'",
        "'An API token with AI Read + Edit permissions from your cloud account dashboard'",
      ],
    ],
  ],
  [
    'packages/workshop-frontend/src/components/chat/AppPreview.tsx',
    [['powered by Workers AI', 'powered by platform AI']],
  ],
  [
    'packages/workshop-frontend/src/data/sample.ts',
    [['using Workers AI', 'using platform AI']],
  ],
  [
    'packages/workshop-frontend/src/data/chat.ts',
    [
      ['using Workers AI', 'using platform AI'],
      ['Configuring Workers AI', 'Configuring platform AI'],
      ['Workers AI binding configured', 'AI binding configured'],
    ],
  ],
]) {
  const path = join(OS, rel)
  if (!existsSync(path)) continue
  let text = read(path)
  for (const [a, b] of pairs) text = replaceAll(text, a, b)
  write(path, text)
}

// UsageSettings: swap CloudflareLogo for Indobase mark when present
{
  const path = join(OS, 'packages/workshop-frontend/src/components/billing/UsageSettings.tsx')
  if (existsSync(path)) {
    let text = read(path)
    text = replaceAll(text, "import CloudflareLogo from '../auth/CloudflareLogo'", "import IndobaseMark from '../IndobaseMark'")
    text = replaceAll(text, '<CloudflareLogo size={16} />', '<IndobaseMark size={16} className="text-kumo-brand" />')
    text = replaceAll(
      text,
      'Connect your Cloud account to keep building once your free allowance runs',
      'Connect a cloud account to keep building once your free allowance runs',
    )
    write(path, text)
  }
}

// --- AuthContext: keep CFOS profile name in sync with Indobase session ---
{
  const path = join(OS, 'packages/workshop-frontend/src/AuthContext.tsx')
  let text = read(path)
  if (text.includes('indobaseSyncProfileFromSession')) {
    console.log('  AuthContext already syncs Indobase display name (skip)')
  } else {
    const marker = `  useEffect(() => {
    let cancelled = false
    authenticatedApi.whoami().then((info) => {
      if (!cancelled) setCurrentUser(info)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [authenticatedApi])`
    const replacement = `  useEffect(() => {
    let cancelled = false
    async function indobaseSyncProfileFromSession() {
      try {
        const info = await authenticatedApi.whoami()
        if (cancelled) return
        setCurrentUser(info)
        const s = await fetch('/api/session', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null)
        if (cancelled || !s || s.guest) return
        const desired = String(s.display_name || '').trim()
          || (s.email && String(s.email).includes('@') ? String(s.email).split('@')[0].trim() : '')
        if (!desired || desired.startsWith('ib_')) return
        if (info?.name === desired) return
        await authenticatedApi.setOwnDisplayName(desired)
        if (!cancelled) setCurrentUser({ ...info, name: desired })
      } catch {
        // best-effort
      }
    }
    indobaseSyncProfileFromSession()
    return () => { cancelled = true }
  }, [authenticatedApi])`
    if (text.includes(marker)) {
      text = text.replace(marker, replacement)
      write(path, text)
      console.log('  AuthContext ← sync display name from /api/session')
    } else {
      console.warn('  skip: AuthContext whoami effect not found (upstream drifted)')
    }
  }
}

// --- Per-session CFOS principal + same-origin API host (Studio SSO is the gate) ---
{
  const path = join(OS, 'packages/workshop-frontend/src/main.tsx')
  let text = read(path)

  const beginMarker = 'async function devAutoLogin(stub: RpcStub<PublicApi>): Promise<void> {'
  const afterMarker = '\n\n// WebSocket RPC connection management.'
  const beginIdx = text.indexOf(beginMarker)
  const afterIdx = text.indexOf(afterMarker, beginIdx)
  const newDevAutoLogin = `async function devAutoLogin(stub: RpcStub<PublicApi>): Promise<void> {
  // Indobase: per-session CFOS principal via /api/os/runtime/agent-credentials
  // (not shared VITE_DEV_USERNAME/PASSWORD). VITE_DEV_AUTO_LOGIN enables this flow.
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const onLoopback = host === 'localhost' || host === '127.0.0.1'
  if (import.meta.env.VITE_DEV_AUTO_LOGIN !== 'true' && !onLoopback) return

  let username = import.meta.env.VITE_DEV_USERNAME ?? 'dev'
  let password = import.meta.env.VITE_DEV_PASSWORD ?? 'devpassword'
  let storageKey: string | null = null
  let signedIn = false
  let displayName = ''

  try {
    const res = await fetch('/api/os/runtime/agent-credentials', { credentials: 'same-origin' })
    if (res.ok) {
      const json = await res.json() as {
        ok?: boolean
        username?: string
        password?: string
        storage_key?: string
        guest?: boolean
        signed_in?: boolean
        stage?: string
        email?: string | null
        display_name?: string | null
      }
      if (json?.ok && json.username && json.password && json.storage_key) {
        username = json.username
        password = json.password
        storageKey = json.storage_key
        signedIn = json.signed_in === true || json.guest === false || json.stage === 'member'
        displayName = String(json.display_name || '').trim()
          || (json.email && String(json.email).includes('@')
            ? String(json.email).split('@')[0].trim()
            : '')
          || ''
      }
    } else if (!onLoopback) {
      console.warn('[indobase] agent-credentials unavailable; skipping auto-login')
      return
    }
  } catch (err) {
    if (!onLoopback) {
      console.warn('[indobase] agent-credentials fetch failed; skipping auto-login', err)
      return
    }
    // Loopback fallback: env VITE_DEV_* for bare CFOS without bridge.
  }

  // Drop stale CFOS tokens when Indobase identity changes (guest → member),
  // otherwise new chats keep the guest principal and re-ask signup.
  const activeKey = 'indobase.cfos.active_storage_key'
  const prevKey = localStorage.getItem(activeKey)
  if (storageKey && prevKey && prevKey !== storageKey) {
    // Guest→member OTP rotates Indobase-derived CFOS credentials, but workspaces are owned
    // by the previous CFOS principal. Keep that token or Doc/preview returns access denied.
    const prevToken = localStorage.getItem(prevKey)
    if (signedIn && prevToken) {
      localStorage.setItem('authToken', prevToken)
      localStorage.setItem(activeKey, prevKey)
      return
    }
    localStorage.removeItem('authToken')
    localStorage.removeItem(prevKey)
  }
  if (signedIn) {
    // Never keep a draft_/guest-scoped token alongside a member cookie.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('indobase.cfos.auth.draft_')) {
        localStorage.removeItem(k)
      }
    }
  }
  if (storageKey) localStorage.setItem(activeKey, storageKey)

  async function syncCfosProfileName(token: string, desired: string): Promise<void> {
    if (!desired || desired.startsWith('ib_')) return
    try {
      const api = await stub.authenticate(token)
      const who = await api.whoami()
      if (who?.name !== desired) await api.setOwnDisplayName(desired)
    } catch {
      // Profile sync is best-effort; chat still works with the token.
    }
  }

  if (storageKey) {
    const scoped = localStorage.getItem(storageKey)
    if (scoped) {
      localStorage.setItem('authToken', scoped)
      if (signedIn && displayName) await syncCfosProfileName(scoped, displayName)
      return
    }
  }
  if (!storageKey && localStorage.getItem('authToken')) {
    // Member Indobase cookie without storage_key must not keep a stale guest CFOS token.
    if (signedIn) {
      localStorage.removeItem('authToken')
    } else {
      return
    }
  }

  const { hashPassword } = await import('./passwordHash')
  const passwordHash = await hashPassword(username, password)

  const accountLabel =
    displayName && !displayName.startsWith('ib_') ? displayName : 'Indobase operator'
  let token = await stub.createAccount(username, accountLabel, passwordHash)
  if (!token) {
    token = await stub.login(username, passwordHash)
  }

  if (token) {
    localStorage.setItem('authToken', token)
    if (storageKey) localStorage.setItem(storageKey, token)
    if (signedIn && displayName) await syncCfosProfileName(token, displayName)
  } else if (signedIn) {
    // Do not leave a previous guest authToken in place after member cookie upgrade.
    localStorage.removeItem('authToken')
  }
}`

  if (
    text.includes('syncCfosProfileName') &&
    text.includes('Indobase operator') &&
    text.includes('Member Indobase cookie without storage_key') &&
    text.includes('indobase.cfos.active_storage_key')
  ) {
    console.log('  devAutoLogin already syncs CFOS profile display name (skip)')
  } else if (
    text.includes('/api/os/runtime/agent-credentials') &&
    beginIdx >= 0 &&
    afterIdx > beginIdx
  ) {
    text = text.slice(0, beginIdx) + newDevAutoLogin + text.slice(afterIdx)
    write(path, text)
    console.log('  devAutoLogin ← profile displayName sync from Indobase session')
  } else if (beginIdx >= 0 && afterIdx > beginIdx) {
    text = text.slice(0, beginIdx) + newDevAutoLogin + text.slice(afterIdx)
    write(path, text)
    console.log('  devAutoLogin ← per-session agent-credentials')
  } else {
    console.warn('  skip: devAutoLogin block not found (upstream drifted)')
  }

  // Off-loopback MUST use window.location.host (same-origin behind builder.indobase.in).
  // Never return VITE_BACKEND_HOST when it is a bind address like 0.0.0.0 — browsers cannot open wss://0.0.0.0.
  const newHost = `function getBackendHost(): string {
  // Same-origin when served behind Indobase bridge (builder.indobase.in).
  // Never use bind addresses like 0.0.0.0 — browsers cannot open wss://0.0.0.0.
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    const backendHost = import.meta.env.VITE_BACKEND_HOST?.trim();
    if (backendHost && !backendHost.startsWith('0.0.0.0')) return backendHost;
    return \`\${host}:8787\`;
  }
  return window.location.host;
}`
  if (
    text.includes('Never use bind addresses like 0.0.0.0') &&
    text.includes('return window.location.host')
  ) {
    console.log('  getBackendHost already Indobase-safe (skip)')
  } else {
    const hostStart = text.indexOf('function getBackendHost(): string {')
    if (hostStart >= 0) {
      // Match balanced braces for the function body.
      let i = hostStart + 'function getBackendHost(): string {'.length
      let depth = 1
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') depth--
        i++
      }
      text = text.slice(0, hostStart) + newHost + text.slice(i)
      console.log('  getBackendHost ← same-origin off-loopback')
    } else {
      console.warn('  warn: getBackendHost not found — check main.tsx')
    }
  }

  // Await auto-login before first paint so LoginPage never flashes.
  const oldBoot = `// Kick off dev auto-login in the background. If it completes before
// useAuth checks the token, the user skips the login page. If the backend
// is unreachable, the app still renders immediately (showing a connection
// banner or login page) instead of hanging on a blank screen.
devAutoLogin(currentStub).catch(() => {})

root.render(
  <StrictMode>
    <FrontendErrorBoundary>
      <AppWithConnection />
    </FrontendErrorBoundary>
  </StrictMode>
)`
  const newBoot = `// Indobase local PoC: finish auto-login before render so signup/login never shows.
void (async () => {
  await devAutoLogin(currentStub).catch(() => {})
  root.render(
    <StrictMode>
      <FrontendErrorBoundary>
        <AppWithConnection />
      </FrontendErrorBoundary>
    </StrictMode>
  )
})()`
  if (text.includes('finish auto-login before render')) {
    console.log('  boot already awaits auto-login (skip)')
  } else if (text.includes(oldBoot)) {
    text = text.replace(oldBoot, newBoot)
  } else {
    console.warn('  skip: boot block drifted')
  }
  write(path, text)
  console.log('  local auto-login enabled (per-session principals)')
}

{
  const envPath = join(OS, 'packages/workshop-frontend/.env.production.local')
  write(
    envPath,
    [
      '# Generated by Indobase rebrand.',
      '# VITE_DEV_AUTO_LOGIN enables the Indobase per-session credentials flow',
      '# (GET /api/os/runtime/agent-credentials → principal-scoped CFOS login).',
      '# VITE_DEV_USERNAME/PASSWORD are loopback-only fallback when the bridge',
      '# credentials endpoint is unavailable — NOT the production shared path.',
      'VITE_DEV_AUTO_LOGIN=true',
      'VITE_DEV_USERNAME=dev',
      'VITE_DEV_PASSWORD=devpassword',
      '# Loopback-only for getBackendHost(); never 0.0.0.0 (bind address breaks browser wss).',
      '# Off-loopback (builder.indobase.in) uses window.location.host via the rebrand patch.',
      'VITE_BACKEND_HOST=localhost:8787',
      '',
    ].join('\n'),
  )
  console.log('  wrote', envPath)
}

// --- ChatInterface: hard Free-plan meter via POST /api/os/agent/begin-turn ---
{
  const path = join(OS, 'packages/workshop-frontend/src/ChatInterface.tsx')
  if (existsSync(path)) {
    let text = read(path)
    const hasGuestSync =
      text.includes('__INDOBASE_GUEST__') && text.includes('meter.clone().json()')
    if (text.includes('/api/os/agent/begin-turn') && hasGuestSync) {
      console.log('  ChatInterface begin-turn meter + guest sync already patched (skip)')
    } else {
      const meterBlockRe =
        /\n    \/\/ Indobase begin-turn meter[\s\S]*?\n    sendInFlightRef\.current = true;/
      const injection = `
    // Indobase begin-turn meter (hard Free-plan enforce).
    // Guests get 200 (no consume) so OTP signup chat works. Fail-closed on 402 only.
    // Fail-open on 5xx/network. Do not abort on 403 — guests must be able to chat.
    try {
      const meter = await fetch('/api/os/agent/begin-turn', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: inputValue }),
      })
      if (meter.status === 402) {
        let msg = 'Free agent limit reached (5 prompts). Upgrade your plan to continue building with Indobase.'
        try {
          const j = await meter.json() as { message?: string }
          if (typeof j?.message === 'string' && j.message.trim()) msg = j.message.trim()
        } catch { /* keep default */ }
        toasts.add({ title: msg, variant: 'error' })
        return
      }
      if (meter.ok) {
        try {
          const j = await meter.clone().json() as { guest?: boolean; stage?: string; signed_in?: boolean }
          const isGuest = j?.signed_in === false || j?.guest === true || j?.stage === 'guest'
          ;(window as unknown as { __INDOBASE_GUEST__?: boolean }).__INDOBASE_GUEST__ = isGuest
          ;(window as unknown as { __INDOBASE_SESSION_STAGE__?: string }).__INDOBASE_SESSION_STAGE__ =
            j?.stage || (isGuest ? 'guest' : 'member')
        } catch { /* ignore */ }
      }
      if (!meter.ok && meter.status >= 500) {
        console.warn('[indobase] begin-turn meter unavailable; allowing send (fail-open)', meter.status)
      }
    } catch (err) {
      console.warn('[indobase] begin-turn meter network error; allowing send (fail-open)', err)
    }

    sendInFlightRef.current = true;`
      if (meterBlockRe.test(text)) {
        text = text.replace(meterBlockRe, injection)
        write(path, text)
        console.log('  ChatInterface ← begin-turn meter + guest sync (upgrade)')
      } else {
        const anchor = `    if (hasFailedAttachment) {
      toasts.add({ title: "Remove failed attachment uploads before sending", variant: "error" });
      return;
    }

    sendInFlightRef.current = true;`
        const full = `    if (hasFailedAttachment) {
      toasts.add({ title: "Remove failed attachment uploads before sending", variant: "error" });
      return;
    }
${injection}`
        if (text.includes(anchor)) {
          text = text.replace(anchor, full)
          write(path, text)
          console.log('  ChatInterface ← begin-turn meter + guest sync')
        } else {
          console.warn('  skip: ChatInterface handleSend meter anchor drifted')
        }
      }
    }
  }
}

// --- Hide model chooser (Indobase routes models server-side; no UI picker) ---
{
  const path = join(OS, 'packages/workshop-frontend/src/ChatInterface.tsx')
  let text = read(path)
  const start = text.indexOf('              <DropdownMenu>\n                <DropdownMenu.Trigger\n                  render={\n                    <button\n                      type="button"\n                      className="group inline-flex h-8 min-w-0 max-w-[180px]')
  const endMarker = '              </DropdownMenu>\n              {isAgentActive && onStop ? ('
  const end = text.indexOf(endMarker, start)
  if (start >= 0 && end > start) {
    const keepFrom = end + '              </DropdownMenu>\n'.length
    text =
      text.slice(0, start) +
      '              {/* Indobase: model picker removed — preferred/server model only */}\n' +
      text.slice(keepFrom)
    write(path, text)
    console.log('  model chooser removed from ChatInterface composer')
  } else if (text.includes('Indobase: model picker removed')) {
    console.log('  model chooser already removed')
  } else {
    console.warn('  skip: ChatInterface model picker block not found (upstream drifted)')
  }
}

{
  const path = join(OS, 'packages/workshop-frontend/src/modelSelection.ts')
  let text = read(path)
  const oldFn = `export function getStoredSelectedModel(
  models: AiChatAuthorInfo[],
): string | null {
  const storedModel = localStorage.getItem(LAST_SELECTED_MODEL_KEY);

  if (storedModel === NO_AGENT_OPTION_VALUE) {
    return null;
  }

  if (storedModel && models.some((model) => model.id === storedModel)) {
    return storedModel;
  }

  // Default: Return the first configured model, or null if none are configured.
  return models[0]?.id ?? null;
}`
  const newFn = `export function getStoredSelectedModel(
  models: AiChatAuthorInfo[],
): string | null {
  // Indobase: no model chooser — approved pool only (never gpt-3.5 / random models[0]).
  const approved = new Set([
    "openai/gpt-5.6-luna",
    "openai/gpt-5.6-terra",
    "openai/gpt-oss-120b",
    "qwen/qwen3-coder-30b-a3b-instruct",
  ]);
  const preferred =
    models.find((model) => model.id === "openai/gpt-5.6-luna") ??
    models.find((model) => model.id.includes("gpt-5.6-luna")) ??
    models.find((model) => model.id === "openai/gpt-5.6-terra") ??
    models.find((model) => model.id === "openai/gpt-oss-120b") ??
    models.find((model) => approved.has(model.id));
  return preferred?.id ?? null;
}`
  if (text.includes(oldFn)) {
    write(path, text.replace(oldFn, newFn))
    console.log('  modelSelection forced to preferred coding model')
  } else if (text.includes('approved pool only') || text.includes('no model chooser — always use preferred')) {
    // Upgrade older Indobase patch that still fell back to models[0]
    if (text.includes('models[0]') && text.includes('no model chooser')) {
      const loose =
        /export function getStoredSelectedModel\(\s*models: AiChatAuthorInfo\[\],\s*\): string \| null \{[\s\S]*?\n\}/
      if (loose.test(text)) {
        write(path, text.replace(loose, newFn.trim()))
        console.log('  modelSelection ← purged models[0] fallback (approved pool only)')
      } else {
        console.log('  modelSelection already forced')
      }
    } else {
      console.log('  modelSelection already forced')
    }
  } else {
    console.warn('  skip: modelSelection getStoredSelectedModel drifted')
  }
}

// --- Indobase format blueprints (Docs / Sheets / Slides / Design) ---
{
  const install = join(ROOT, 'scripts/install-indobase-formats.sh')
  if (existsSync(install)) {
    console.log('Installing Indobase formats (FORMAT_BLUEPRINTS_DIR → formats/)…')
    const r = spawnSync('bash', [install], {
      env: { ...process.env, CLOUDFLARE_OS_DIR: OS, FORMAT_BLUEPRINTS_DIR: join(ROOT, 'formats') },
      stdio: 'inherit',
    })
    if (r.status !== 0) {
      console.warn('  warning: install-indobase-formats.sh failed; runtime may keep upstream formats')
    }
  }
}

// --- Agent SYSTEM_PROMPT: hard Design format routing (survives AdminConfig gaps) ---
{
  const path = join(OS, 'packages/workshop-backend/src/agent.ts')
  if (existsSync(path)) {
    let text = readFileSync(path, 'utf8')
    const marker = 'Indobase format routing (mandatory)'
    if (text.includes(marker)) {
      console.log('  agent SYSTEM_PROMPT already has Design routing')
    } else {
      const anchor =
        'When the user asks for a new Gadget, ALWAYS consider starting from a blueprint. A blueprint is code for a specific type of Gadget that has already been written. The \\`listBlueprints\\` tool returns a list of available blueprints. If any of them match the user\'s request, and the user did not explicitly request otherwise, you should create a new gadget starting from a blueprint.'
      const injection =
        anchor +
        '\n\n# Indobase format routing (mandatory)\n\n' +
        'ALWAYS use Design format (blueprintId format.design) for logos, Instagram/LinkedIn/Facebook posts and stories, posters, flyers, banners, thumbnails, and any graphic/creative design request. ' +
        'NEVER use Slides (format.slides), Docs, Sheets, a random gadget, or a hand-written HTML mock for those intents — instantiate format.design with createGadget({ blueprintId: "format.design" }). ' +
        'After creating Design, call bootstrapFromPrompt(userMessage) or setPreset (logo | ig-post | story | poster); edit layers via executeCode RPC, do not rewrite client.js for content.'
      if (!text.includes(anchor)) {
        console.warn('  skip: agent SYSTEM_PROMPT blueprint anchor drifted')
      } else {
        text = text.replace(anchor, injection)
        writeFileSync(path, text)
        console.log('  agent SYSTEM_PROMPT ← Design format routing')
      }
    }
  }
}

// --- Agent tool: launchBusiness (POST to Indobase bridge; webFetch cannot POST) ---
{
  const agentPath = join(OS, 'packages/workshop-backend/src/agent.ts')
  const overseerPath = join(OS, 'packages/workshop-backend/src/overseer.ts')
  const envPath = join(OS, 'packages/workshop-backend/src/env.d.ts')

  if (existsSync(agentPath)) {
    let text = readFileSync(agentPath, 'utf8')
    if (text.includes('Indobase launchBusiness tool') || text.includes('name: "launchBusiness"')) {
      console.log('  launchBusiness AgentTool already patched')
    } else {
      // 1) AgentHooks method
      const hooksAnchor = `  // Returns the resources needed by \`webFetch\` to delegate document-to-Markdown conversion
  // to Workers AI. Exposed as a narrow interface (rather than handing over the whole \`env\`)
  // so the dependency surface stays explicit.
  getWebFetchEnv(): WebFetchEnv;`
      const hooksInjection = `${hooksAnchor}

  // Indobase: config for the built-in launchBusiness tool (bridge URL + OS secret).
  // Null when unset — tool then explains Launch is not configured.
  getIndobaseLaunchConfig(): { bridgeUrl: string; osSecret: string } | null;`
      if (text.includes(hooksAnchor) && !text.includes('getIndobaseLaunchConfig')) {
        text = text.replace(hooksAnchor, hooksInjection)
      } else if (!text.includes('getIndobaseLaunchConfig')) {
        console.warn('  skip: AgentHooks getWebFetchEnv anchor drifted')
      }

      // 2) System prompt note near webFetch description
      const webFetchNote =
        'The Gadget\'s own code (server.js / client.js) still cannot make network requests at runtime; \\`webFetch\\` is a tool for *you*, not something you can call from gadget code.'
      if (text.includes(webFetchNote) && !text.includes('Indobase Go Live / Launch Business')) {
        text = text.replace(
          webFetchNote,
          webFetchNote +
            '\n\n# Indobase Go Live / Launch Business\n\n' +
            'To take a site live you MUST call the \\`launchBusiness\\` tool (alias goLive) with real html or files. ' +
            'Do NOT use webFetch for Launch (GET-only, no cookies). Do NOT invent a live URL. ' +
            'Only claim live after the tool returns ok:true with a non-empty url.',
        )
      }

      // 3) Insert tool after webFetch block — find webFetch closing and inject before editFile or after webFetch
      const toolMarker = '    webFetch: defineTool({'
      if (text.includes(toolMarker) && !text.includes('Indobase launchBusiness tool')) {
        const launchTool = `
    // Indobase launchBusiness tool — posts site HTML to the Indobase OS bridge.
    // webFetch cannot do this (HTTPS GET only, no cookies / POST).
    launchBusiness: defineTool({
      name: "launchBusiness",
      label: "Launch business",
      description:
          "Take the business live on Indobase. Posts real html/files to the Indobase launch API. " +
          "Returns the live URL. Never invent a URL. Alias: goLive.",
      parameters: Type.Object({
        title: Type.Optional(Type.String({ description: "Business / site title" })),
        subdomain: Type.Optional(Type.String({
          description: "Indobase subdomain label (e.g. sprouteats)",
        })),
        customDomain: Type.Optional(Type.String({
          description: "Optional domain they already own (CNAME → sites.indobase.in)",
        })),
        html: Type.Optional(Type.String({
          description: "Full index HTML to publish (required if files omitted)",
        })),
        files: Type.Optional(Type.Any({
          description: "Path→content map (must include index.html if html omitted)",
        })),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_live: false,
            code: "launch_not_configured",
            message:
              "Indobase launch is not configured on this runtime (missing INDOBASE_BRIDGE_URL and/or INDOBASE_OS_SECRET). Tools exist — ask the operator to reseed CFOS vars and reload; this is not a missing catalog tool.",
          }));
        }
        const html = typeof args.html === "string" ? args.html : undefined;
        const files =
          args.files && typeof args.files === "object" && !Array.isArray(args.files)
            ? args.files as Record<string, string>
            : undefined;
        if ((!html || !html.trim()) && !(files && Object.keys(files).length > 0)) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_live: false,
            code: "content_required",
            message: "launchBusiness requires real html or files (e.g. index.html). Do not call empty.",
          }));
        }
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_live: false,
            code: "agent_identity_missing",
            message: "Cannot Launch: missing agent username. Reload Indobase OS and sign in again.",
          }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/launchBusiness";
        let resp: Response;
        try {
          resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-Indobase-OS-Secret": cfg.osSecret,
              "X-Indobase-Agent-Username": agentUsername,
            },
            body: JSON.stringify({
              title: args.title,
              subdomain: args.subdomain,
              customDomain: args.customDomain,
              html,
              files,
            }),
          });
        } catch (err) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_live: false,
            code: "launch_network_error",
            message: err instanceof Error ? err.message : "Launch request failed",
          }));
        }
        let body: Record<string, unknown> = {};
        try {
          body = await resp.json() as Record<string, unknown>;
        } catch {
          body = { ok: false, message: await resp.text().catch(() => "non-JSON launch response") };
        }
        const ok = resp.ok && body.ok === true;
        const url = typeof body.url === "string" ? body.url : undefined;
        return toolResult(jsonToolResultText({
          ...body,
          ok,
          claim_live: ok && Boolean(url),
          httpStatus: resp.status,
          tool: "launchBusiness",
        }));
      },
    }),
`
        text = text.replace(toolMarker, launchTool + toolMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← launchBusiness AgentTool')
      } else {
        console.warn('  skip: webFetch tool anchor not found for launchBusiness')
      }
    }
  }

  // --- Agent tool: connectGateway (BYOK Razorpay/Stripe keys; webFetch cannot POST) ---
  if (existsSync(agentPath)) {
    let text = readFileSync(agentPath, 'utf8')
    if (
      text.includes('Indobase connectGateway tool') ||
      text.includes('name: "connectGateway"')
    ) {
      console.log('  connectGateway AgentTool already patched')
    } else {
      const connectTool = `
    // Indobase connectGateway tool — paste Razorpay/Stripe API keys after PSP KYC.
    // webFetch cannot do this (HTTPS GET only, no cookies / POST).
    connectGateway: defineTool({
      name: "connectGateway",
      label: "Connect payment gateway",
      description:
          "Connect payment gateway keys after the operator finishes KYC on Razorpay or Stripe. " +
          "Posts keys to Indobase (validated + synced to Payments). Never invent keys. " +
          "Alias: connectPaymentGateway. Do not use webFetch.",
      parameters: Type.Object({
        settlement_market: Type.String({
          description: "india | international (aliases razorpay | stripe)",
        }),
        key_id: Type.Optional(Type.String({ description: "Razorpay Key Id (rzp_…) — India" })),
        key_secret: Type.Optional(Type.String({ description: "Razorpay Key Secret — India" })),
        publishable_key: Type.Optional(Type.String({
          description: "Stripe publishable key (pk_…) — International",
        })),
        secret_key: Type.Optional(Type.String({
          description: "Stripe secret key (sk_…) — International",
        })),
        webhook_secret: Type.Optional(Type.String({
          description: "Optional webhook signing secret",
        })),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_gateway_ready: false,
            code: "bridge_not_configured",
            message:
              "Indobase bridge is not configured (missing INDOBASE_BRIDGE_URL and/or INDOBASE_OS_SECRET). Tools exist — operator must reseed CFOS .dev.vars; this is not a missing tool.",
          }));
        }
        const market = typeof args.settlement_market === "string" ? args.settlement_market.trim() : "";
        if (!market) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_gateway_ready: false,
            code: "settlement_market_required",
            message: "settlement_market required (india|international|razorpay|stripe)",
          }));
        }
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_gateway_ready: false,
            code: "agent_identity_missing",
            message: "Cannot connect gateway: missing agent username. Reload Indobase OS and sign in again.",
          }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/connectGateway";
        let resp: Response;
        try {
          resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-Indobase-OS-Secret": cfg.osSecret,
              "X-Indobase-Agent-Username": agentUsername,
            },
            body: JSON.stringify({
              settlement_market: market,
              key_id: args.key_id,
              key_secret: args.key_secret,
              publishable_key: args.publishable_key,
              secret_key: args.secret_key,
              webhook_secret: args.webhook_secret,
            }),
          });
        } catch (err) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_gateway_ready: false,
            code: "connect_gateway_network_error",
            message: err instanceof Error
              ? ("Bridge unreachable for connectGateway (" + cfg.bridgeUrl + "): " + err.message + ". Tool exists — retry. If keys are missing, ask the operator to finish Razorpay/Stripe KYC and paste API keys (not a missing backend tool).")
              : "connectGateway request failed",
          }));
        }
        let body: Record<string, unknown> = {};
        try {
          body = await resp.json() as Record<string, unknown>;
        } catch {
          body = { ok: false, message: await resp.text().catch(() => "non-JSON connectGateway response") };
        }
        const ok = resp.ok && body.ok === true;
        return toolResult(jsonToolResultText({
          ...body,
          ok,
          claim_gateway_ready: ok && (body.can_go_live === true || body.gateway_keys_configured === true),
          httpStatus: resp.status,
          tool: "connectGateway",
        }));
      },
    }),
`
      const launchMarker = '    // Indobase launchBusiness tool'
      const webFetchMarker = '    webFetch: defineTool({'
      if (text.includes(launchMarker)) {
        text = text.replace(launchMarker, connectTool + launchMarker)
        // Prompt note
        if (!text.includes('Indobase Connect payment gateway')) {
          const liveNote =
            'Only claim live after the tool returns ok:true with a non-empty url.'
          if (text.includes(liveNote)) {
            text = text.replace(
              liveNote,
              liveNote +
                '\n\n# Indobase Connect payment gateway\n\n' +
                'When the operator pastes Razorpay/Stripe API keys after PSP KYC, you MUST call the \\`connectGateway\\` tool ' +
                '(alias connectPaymentGateway). Do NOT use webFetch. Quote ok + gateway_connector_synced, then wire checkout.',
            )
          }
        }
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← connectGateway AgentTool')
      } else if (text.includes(webFetchMarker) && !text.includes('name: "connectGateway"')) {
        text = text.replace(webFetchMarker, connectTool + webFetchMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← connectGateway AgentTool (webFetch anchor)')
      } else {
        console.warn('  skip: no anchor found for connectGateway AgentTool')
      }
    }
  }

  // --- Agent tool: wireCheckout (hosted checkout_url after connectGateway) ---
  if (existsSync(agentPath)) {
    let text = readFileSync(agentPath, 'utf8')
    if (
      text.includes('Indobase wireCheckout tool') ||
      text.includes('name: "wireCheckout"')
    ) {
      console.log('  wireCheckout AgentTool already patched')
    } else {
      const wireTool = `
    // Indobase wireCheckout tool — plan + customer + hosted checkout_url for site CTAs.
    // webFetch cannot do this (HTTPS GET only, no cookies / POST).
    wireCheckout: defineTool({
      name: "wireCheckout",
      label: "Wire checkout",
      description:
          "Create Indobase Payments plan + customer + hosted checkout session and return checkout_url. " +
          "Use that exact URL for Subscribe/Buy CTAs. Never invent a checkout URL. " +
          "Requires gateway keys first (connectGateway). Alias: wirePricing. Do not use webFetch.",
      parameters: Type.Object({
        plan_version_id: Type.Optional(Type.String({
          description: "Existing plan version id (skip plan create when set)",
        })),
        plan_name: Type.Optional(Type.String({ description: "Plan name when creating (default Starter)" })),
        price: Type.Optional(Type.String({
          description: "Price in major units, e.g. \\"999\\" or \\"19.99\\" (required if creating plan)",
        })),
        currency: Type.Optional(Type.String({ description: "ISO currency, default INR" })),
        billing_period: Type.Optional(Type.String({
          description: "MONTHLY or ANNUAL (default MONTHLY)",
        })),
        customer_id: Type.Optional(Type.String({ description: "Existing customer id or alias" })),
        customer_name: Type.Optional(Type.String({ description: "Customer name when creating" })),
        customer_email: Type.Optional(Type.String({
          description: "Customer email when creating (required if no customer_id)",
        })),
        expires_in_hours: Type.Optional(Type.Number({
          description: "Checkout session TTL hours (default 24)",
        })),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_checkout_ready: false,
            code: "bridge_not_configured",
            message:
              "Indobase bridge is not configured (missing INDOBASE_BRIDGE_URL and/or INDOBASE_OS_SECRET). Tools exist — operator must reseed CFOS .dev.vars; this is not a missing tool.",
          }));
        }
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_checkout_ready: false,
            code: "agent_identity_missing",
            message: "Cannot wire checkout: missing agent username. Reload Indobase OS and sign in again.",
          }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/wireCheckout";
        let resp: Response;
        try {
          resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-Indobase-OS-Secret": cfg.osSecret,
              "X-Indobase-Agent-Username": agentUsername,
            },
            body: JSON.stringify({
              plan_version_id: args.plan_version_id,
              plan_name: args.plan_name,
              price: args.price,
              currency: args.currency,
              billing_period: args.billing_period,
              customer_id: args.customer_id,
              customer_name: args.customer_name,
              customer_email: args.customer_email,
              expires_in_hours: args.expires_in_hours,
            }),
          });
        } catch (err) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_checkout_ready: false,
            code: "wire_checkout_network_error",
            message: err instanceof Error ? err.message : "wireCheckout request failed",
          }));
        }
        let body: Record<string, unknown> = {};
        try {
          body = await resp.json() as Record<string, unknown>;
        } catch {
          body = { ok: false, message: await resp.text().catch(() => "non-JSON wireCheckout response") };
        }
        const checkoutUrl =
          typeof body.checkout_url === "string" && body.checkout_url.startsWith("http")
            ? body.checkout_url
            : undefined;
        const ok = resp.ok && body.ok === true && Boolean(checkoutUrl);
        return toolResult(jsonToolResultText({
          ...body,
          ok,
          claim_checkout_ready: ok,
          checkout_url: checkoutUrl,
          httpStatus: resp.status,
          tool: "wireCheckout",
        }));
      },
    }),
`
      const connectMarker = '    // Indobase connectGateway tool'
      const launchMarker = '    // Indobase launchBusiness tool'
      const webFetchMarker = '    webFetch: defineTool({'
      if (text.includes(connectMarker)) {
        text = text.replace(connectMarker, wireTool + connectMarker)
        if (!text.includes('Indobase Wire checkout')) {
          const connectNote =
            '(alias connectPaymentGateway). Do NOT use webFetch. Quote ok + gateway_connector_synced, then wire checkout.'
          if (text.includes(connectNote)) {
            text = text.replace(
              connectNote,
              connectNote +
                '\n\n# Indobase Wire checkout\n\n' +
                'After connectGateway succeeds, call the \\`wireCheckout\\` tool (alias wirePricing) to mint checkout_url, ' +
                'then patch the site Subscribe/Buy CTA to that URL. Never invent a checkout URL.',
            )
          }
        }
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← wireCheckout AgentTool')
      } else if (text.includes(launchMarker)) {
        text = text.replace(launchMarker, wireTool + launchMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← wireCheckout AgentTool (launchBusiness anchor)')
      } else if (text.includes(webFetchMarker) && !text.includes('name: "wireCheckout"')) {
        text = text.replace(webFetchMarker, wireTool + webFetchMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← wireCheckout AgentTool (webFetch anchor)')
      } else {
        console.warn('  skip: no anchor found for wireCheckout AgentTool')
      }
    }
  }

  // --- Agent tool: setupShopCatalog (tenant DB inventory; webFetch cannot POST) ---
  if (existsSync(agentPath)) {
    let text = readFileSync(agentPath, 'utf8')
    if (
      text.includes('Indobase setupShopCatalog tool') ||
      text.includes('name: "setupShopCatalog"')
    ) {
      console.log('  setupShopCatalog AgentTool already patched')
    } else {
      const shopTool = `
    // Indobase setupShopCatalog tool — tenant DB products + stock + admin_html.
    setupShopCatalog: defineTool({
      name: "setupShopCatalog",
      label: "Setup shop catalog",
      description:
          "Ensure shop tables, upsert products with stock/prices/image_url, return catalog_json + admin_html. " +
          "Call after Enable database. Alias: seedShopCatalog. Do not use webFetch.",
      parameters: Type.Object({
        brand: Type.Optional(Type.String({ description: "Brand name for admin_html" })),
        products: Type.Optional(Type.Array(Type.Object({
          slug: Type.Optional(Type.String()),
          name: Type.String(),
          description: Type.Optional(Type.String()),
          price: Type.String({ description: "Major units, e.g. \\"480\\"" }),
          currency: Type.Optional(Type.String()),
          stock: Type.Optional(Type.Number()),
          image_url: Type.Optional(Type.String()),
          active: Type.Optional(Type.Boolean()),
        }))),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_catalog_ready: false,
            code: "bridge_not_configured",
            message: "Indobase bridge is not configured.",
          }));
        }
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_catalog_ready: false,
            code: "agent_identity_missing",
            message: "Missing agent username. Reload Indobase OS and sign in again.",
          }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/setupShopCatalog";
        let resp: Response;
        try {
          resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-Indobase-OS-Secret": cfg.osSecret,
              "X-Indobase-Agent-Username": agentUsername,
            },
            body: JSON.stringify({
              brand: args.brand,
              products: args.products,
              action: "setup",
            }),
          });
        } catch (err) {
          return toolResult(jsonToolResultText({
            ok: false,
            claim_catalog_ready: false,
            code: "shop_catalog_network_error",
            message: err instanceof Error ? ("Bridge unreachable for setupShopCatalog (" + cfg.bridgeUrl + "): " + err.message + ". Catalog tool exists — retry; if this persists, check INDOBASE_BRIDGE_URL / DNS.") : "setupShopCatalog failed",
          }));
        }
        let body: Record<string, unknown> = {};
        try {
          body = await resp.json() as Record<string, unknown>;
        } catch {
          body = { ok: false, message: await resp.text().catch(() => "non-JSON setupShopCatalog response") };
        }
        const ok = resp.ok && body.ok === true;
        return toolResult(jsonToolResultText({
          ...body,
          ok,
          claim_catalog_ready: ok,
          httpStatus: resp.status,
          tool: "setupShopCatalog",
        }));
      },
    }),
`
      const wireMarker = '    // Indobase wireCheckout tool'
      const connectMarker = '    // Indobase connectGateway tool'
      const launchMarker = '    // Indobase launchBusiness tool'
      if (text.includes(wireMarker)) {
        text = text.replace(wireMarker, shopTool + wireMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← setupShopCatalog AgentTool')
      } else if (text.includes(connectMarker)) {
        text = text.replace(connectMarker, shopTool + connectMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← setupShopCatalog AgentTool (connectGateway anchor)')
      } else if (text.includes(launchMarker)) {
        text = text.replace(launchMarker, shopTool + launchMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← setupShopCatalog AgentTool (launchBusiness anchor)')
      } else {
        console.warn('  skip: no anchor found for setupShopCatalog AgentTool')
      }
    }
  }

  // --- Agent tools: ensure* / applySchema / productionChecklist / resolveProductImages / shop orders ---
  if (existsSync(agentPath)) {
    let text = readFileSync(agentPath, 'utf8')
    if (
      text.includes('Indobase ensureLogin tool') ||
      text.includes('name: "ensureLogin"')
    ) {
      console.log('  ensure*/applySchema/checklist/images AgentTools already patched')
    } else {
      const capabilityTools = `
    // Indobase ensureLogin tool — runtime/ensure login (webFetch cannot POST).
    ensureLogin: defineTool({
      name: "ensureLogin",
      label: "Enable login",
      description:
          "Enable customer login for this business. Quote Login enabled + next_steps. Do not use webFetch.",
      parameters: Type.Object({}),
      execute: async () => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        }
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/ensureLogin";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: "{}",
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "ensureLogin" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "ensure_network_error", message: err instanceof Error ? ("Bridge unreachable for ensureLogin (" + cfg.bridgeUrl + "): " + err.message + ". Tools are configured — retry; if this persists, operator should check INDOBASE_BRIDGE_URL / DNS.") : "ensureLogin failed" }));
        }
      },
    }),

    // Indobase ensureDatabase tool
    ensureDatabase: defineTool({
      name: "ensureDatabase",
      label: "Enable database",
      description: "Enable the customer database (businessData). Then call applySchema or setupShopCatalog. Do not use webFetch.",
      parameters: Type.Object({}),
      execute: async () => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/ensureDatabase";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: "{}",
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "ensureDatabase" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "ensure_network_error", message: err instanceof Error ? ("Bridge unreachable for ensureDatabase (" + cfg.bridgeUrl + "): " + err.message + ". Tools are configured — retry; if this persists, operator should check INDOBASE_BRIDGE_URL / DNS.") : "ensureDatabase failed" }));
        }
      },
    }),

    // Indobase ensureEmail tool
    ensureEmail: defineTool({
      name: "ensureEmail",
      label: "Enable email",
      description: "Enable Indobase Email. Usually returns pending_setup + launch_url. Do not claim Email enabled until setup finishes. Do not use webFetch.",
      parameters: Type.Object({}),
      execute: async () => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/ensureEmail";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: "{}",
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "ensureEmail" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "ensure_network_error", message: err instanceof Error ? ("Bridge unreachable for ensureEmail (" + cfg.bridgeUrl + "): " + err.message + ". Tools are configured — retry.") : "ensureEmail failed" }));
        }
      },
    }),

    // Indobase ensureAnalytics tool
    ensureAnalytics: defineTool({
      name: "ensureAnalytics",
      label: "Enable analytics",
      description: "Enable Indobase Analytics. Returns launch_url for site setup. Do not claim Analytics live from ensure alone. Do not use webFetch.",
      parameters: Type.Object({}),
      execute: async () => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/ensureAnalytics";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: "{}",
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "ensureAnalytics" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "ensure_network_error", message: err instanceof Error ? ("Bridge unreachable for ensureAnalytics (" + cfg.bridgeUrl + "): " + err.message + ". Tools are configured — retry.") : "ensureAnalytics failed" }));
        }
      },
    }),

    // Indobase applySchema tool — declarative tables only.
    applySchema: defineTool({
      name: "applySchema",
      label: "Apply data model",
      description: "Apply declarative tables to the customer database. Call ensureDatabase first. Do not send arbitrary SQL. Do not use webFetch.",
      parameters: Type.Object({
        brand: Type.Optional(Type.String()),
        tables: Type.Array(Type.Any({ description: "Declarative table defs (name + columns)" })),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/applySchema";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: JSON.stringify({ brand: args.brand, tables: args.tables }),
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "applySchema" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "apply_schema_network_error", message: err instanceof Error ? err.message : "applySchema failed" }));
        }
      },
    }),

    // Indobase productionChecklist tool — claim gate.
    productionChecklist: defineTool({
      name: "productionChecklist",
      label: "Production checklist",
      description: "Claim-production-ready gate by app_type. Only claim production ready when claim_production_ready is true. Do not use webFetch.",
      parameters: Type.Object({
        app_type: Type.String({ description: "saas | ecommerce | booking | blog | landing | dashboard | other" }),
        live_url: Type.Optional(Type.String()),
        checks: Type.Optional(Type.Any()),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, claim_production_ready: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, claim_production_ready: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/productionChecklist";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: JSON.stringify({ app_type: args.app_type, live_url: args.live_url, checks: args.checks }),
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "productionChecklist" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, claim_production_ready: false, code: "checklist_network_error", message: err instanceof Error ? err.message : "productionChecklist failed" }));
        }
      },
    }),

    // Indobase resolveProductImages tool — Openverse commercial URLs.
    resolveProductImages: defineTool({
      name: "resolveProductImages",
      label: "Resolve product images",
      description: "Resolve commercial-friendly HTTPS image URLs for product names. Pass urls as image_url into setupShopCatalog. Never invent Unsplash URLs. Do not use webFetch.",
      parameters: Type.Object({
        queries: Type.Array(Type.String({ description: "Product name or search phrase" })),
        page_size: Type.Optional(Type.Number()),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/resolveProductImages";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: JSON.stringify({ queries: args.queries, page_size: args.page_size }),
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "resolveProductImages" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "product_images_network_error", message: err instanceof Error ? err.message : "resolveProductImages failed" }));
        }
      },
    }),

    // Indobase placeTestShopOrder tool
    placeTestShopOrder: defineTool({
      name: "placeTestShopOrder",
      label: "Place test shop order",
      description: "Place a test order against shop_products to prove inventory. Prefer cleanup:true. Do not use webFetch.",
      parameters: Type.Object({
        email: Type.Optional(Type.String()),
        items: Type.Optional(Type.Array(Type.Any())),
        cleanup: Type.Optional(Type.Boolean()),
        brand: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/placeTestShopOrder";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: JSON.stringify({ email: args.email, items: args.items, cleanup: args.cleanup, brand: args.brand }),
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "placeTestShopOrder" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "shop_order_network_error", message: err instanceof Error ? ("Bridge unreachable for placeTestShopOrder (" + cfg.bridgeUrl + "): " + err.message + ". Tool exists — retry; not a missing catalog tool.") : "placeTestShopOrder failed" }));
        }
      },
    }),

    // Indobase listShopOrders tool
    listShopOrders: defineTool({
      name: "listShopOrders",
      label: "List shop catalog/orders",
      description: "List shop products + recent orders and return admin_html (live REST refresh). Alias: listShopCatalog. Do not use webFetch.",
      parameters: Type.Object({
        brand: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) return toolResult(jsonToolResultText({ ok: false, code: "bridge_not_configured", message: "Indobase bridge is not configured." }));
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({ ok: false, code: "agent_identity_missing", message: "Missing agent username. Reload Indobase OS." }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/tools/listShopOrders";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "X-Indobase-OS-Secret": cfg.osSecret, "X-Indobase-Agent-Username": agentUsername },
            body: JSON.stringify({ brand: args.brand }),
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { ok: false, message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({ ...body, ok: resp.ok && body.ok === true, httpStatus: resp.status, tool: "listShopOrders" }));
        } catch (err) {
          return toolResult(jsonToolResultText({ ok: false, code: "shop_list_network_error", message: err instanceof Error ? err.message : "listShopOrders failed" }));
        }
      },
    }),

`
      const shopMarker = '    // Indobase setupShopCatalog tool'
      const wireMarker = '    // Indobase wireCheckout tool'
      const launchMarker = '    // Indobase launchBusiness tool'
      if (text.includes(shopMarker)) {
        text = text.replace(shopMarker, capabilityTools + shopMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← ensure*/applySchema/checklist/images AgentTools')
      } else if (text.includes(wireMarker)) {
        text = text.replace(wireMarker, capabilityTools + wireMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← ensure* AgentTools (wireCheckout anchor)')
      } else if (text.includes(launchMarker)) {
        text = text.replace(launchMarker, capabilityTools + launchMarker)
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← ensure* AgentTools (launchBusiness anchor)')
      } else {
        console.warn('  skip: no anchor found for ensure*/applySchema AgentTools')
      }
    }
  }

  // --- sessionStatus / authStart / authVerify AgentTools (OTP; webFetch cannot POST) ---
  if (existsSync(agentPath)) {
    let text = readFileSync(agentPath, 'utf8')
    if (text.includes('Indobase authStart tool') || text.includes('name: "authStart"')) {
      if (!text.includes('name: "sessionStatus"') && !text.includes('Indobase sessionStatus')) {
        const sessionStatusTool = `
    // Indobase sessionStatus — check signed-in before OTP (do not re-ask every chat).
    sessionStatus: defineTool({
      name: "sessionStatus",
      label: "Check Indobase sign-in",
      description:
          "Return whether the operator is already signed in to Indobase (guest vs member). " +
          "Call this at the start of a new chat or before authStart. If signed_in/stage=member, " +
          "do NOT ask for signup or OTP — continue the original request.",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "auth_not_configured",
            message: "Indobase auth bridge is not configured on this runtime.",
          }));
        }
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "agent_identity_missing",
            message: "Cannot read session: missing agent username. Reload Indobase OS.",
          }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/api/os/runtime/session-status";
        try {
          const resp = await fetch(endpoint, {
            method: "GET",
            headers: {
              "X-Indobase-OS-Secret": cfg.osSecret,
              "X-Indobase-Agent-Username": agentUsername,
            },
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({
            ...body,
            ok: resp.ok && body.ok === true,
            httpStatus: resp.status,
            tool: "sessionStatus",
            next: body.signed_in === true || body.guest === false || body.stage === "member"
              ? "Operator is signed in — skip authStart/authVerify; continue their request."
              : "Operator is a guest — collect name+email+DPDP, then authStart → authVerify once.",
          }));
        } catch (err) {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "auth_network_error",
            message: err instanceof Error ? err.message : "sessionStatus failed",
          }));
        }
      },
    }),
`
        const authAnchor = text.includes('// Indobase authStart tool')
          ? '// Indobase authStart tool'
          : '    authStart: defineTool({'
        if (text.includes(authAnchor)) {
          text = text.replace(authAnchor, `${sessionStatusTool}${authAnchor}`)
          // Refresh SYSTEM_PROMPT guest note if still the old wording
          text = text.replace(
            'For Guest operators: call \\`authStart\\` (name+email+dpdpConsent) then \\`authVerify\\` with the email code before Launch/Enable. ',
            'Call \\`sessionStatus\\` first each chat — if signed_in/member, SKIP signup. Only for Guest operators: call \\`authStart\\` (name+email+dpdpConsent) then \\`authVerify\\` with the email code before Launch/Enable. ',
          )
          writeFileSync(agentPath, text)
          console.log('  agent.ts ← sessionStatus AgentTool')
        } else {
          console.warn('  skip: authStart anchor missing for sessionStatus inject')
        }
      } else {
        console.log('  authStart/authVerify/sessionStatus AgentTools already patched')
      }
    } else {
      const toolMarker = '    // Indobase launchBusiness tool'
      const authTools = `
    // Indobase authStart tool — send email OTP (webFetch is GET-only).
    authStart: defineTool({
      name: "authStart",
      label: "Send verification code",
      description:
          "Send an Indobase email verification OTP. Requires name, email, and dpdpConsent:true. " +
          "Use BEFORE launch/enable when the operator is a Guest. Do not use webFetch.",
      parameters: Type.Object({
        name: Type.String({ description: "Operator display name" }),
        email: Type.String({ description: "Operator email for the OTP" }),
        dpdpConsent: Type.Boolean({
          description: "Must be true — Privacy Policy + Terms (DPDP) consent",
        }),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "auth_not_configured",
            message: "Indobase auth bridge is not configured on this runtime.",
          }));
        }
        if (!args.dpdpConsent) {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "dpdp_required",
            message: "dpdpConsent must be true before sending OTP.",
          }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/auth/start";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: args.name,
              email: args.email,
              dpdpConsent: true,
            }),
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({
            ...body,
            ok: resp.ok && body.ok === true,
            httpStatus: resp.status,
            tool: "authStart",
            next: "Ask the operator for the 6-digit code from email, then call authVerify.",
          }));
        } catch (err) {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "auth_network_error",
            message: err instanceof Error ? err.message : "authStart failed",
          }));
        }
      },
    }),

    // Indobase authVerify tool — verify OTP; browser claims session via /api/os/auth/claim-session.
    authVerify: defineTool({
      name: "authVerify",
      label: "Verify email code",
      description:
          "Verify the Indobase email OTP and finish account creation. After ok, tell the operator " +
          "to wait a moment or refresh — the browser completes sign-in automatically.",
      parameters: Type.Object({
        name: Type.String({ description: "Same name used in authStart" }),
        email: Type.String({ description: "Same email used in authStart" }),
        token: Type.String({ description: "6-digit verification code from email" }),
      }),
      execute: async (_toolCallId, args) => {
        const cfg = hooks.getIndobaseLaunchConfig();
        if (!cfg) {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "auth_not_configured",
            message: "Indobase auth bridge is not configured on this runtime.",
          }));
        }
        const agentUsername = initiator?.id;
        if (!agentUsername || typeof agentUsername !== "string") {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "agent_identity_missing",
            message: "Cannot verify: missing agent username. Reload Indobase OS.",
          }));
        }
        const endpoint = cfg.bridgeUrl.replace(/\\/+$/, "") + "/auth/verify";
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-Indobase-OS-Secret": cfg.osSecret,
              "X-Indobase-Agent-Username": agentUsername,
            },
            body: JSON.stringify({
              name: args.name,
              email: args.email,
              token: args.token,
            }),
          });
          let body: Record<string, unknown> = {};
          try { body = await resp.json() as Record<string, unknown>; }
          catch { body = { message: await resp.text().catch(() => "non-JSON") }; }
          return toolResult(jsonToolResultText({
            ...body,
            ok: resp.ok && body.ok === true,
            httpStatus: resp.status,
            tool: "authVerify",
            next: resp.ok
              ? "Verified. Ask the operator to wait ~15s or refresh — sign-in completes in the browser."
              : undefined,
          }));
        } catch (err) {
          return toolResult(jsonToolResultText({
            ok: false,
            code: "auth_network_error",
            message: err instanceof Error ? err.message : "authVerify failed",
          }));
        }
      },
    }),

    // Indobase launchBusiness tool`
      if (text.includes(toolMarker)) {
        text = text.replace(toolMarker, authTools)
        // Prompt note for account gate
        if (!text.includes('Indobase account OTP tools')) {
          const gateNote =
            'To take a site live you MUST call the \\`launchBusiness\\` tool (alias goLive) with real html or files. '
          if (text.includes(gateNote)) {
            text = text.replace(
              gateNote,
              'Call \\`sessionStatus\\` first each chat — if signed_in/member, SKIP signup. Only for Guest operators: call \\`authStart\\` (name+email+dpdpConsent) then \\`authVerify\\` with the email code before Launch/Enable. ' +
                gateNote,
            )
          }
        }
        writeFileSync(agentPath, text)
        console.log('  agent.ts ← authStart/authVerify AgentTools')
      } else {
        console.warn('  skip: launchBusiness marker not found for auth tools')
      }
    }
  }

  if (existsSync(overseerPath)) {
    let text = readFileSync(overseerPath, 'utf8')
    if (text.includes('getIndobaseLaunchConfig()')) {
      // Strip leftover debug probe from earlier sessions (idempotent).
      if (text.includes('launch_config_probe')) {
        const withProbe =
          /getIndobaseLaunchConfig\(\): \{ bridgeUrl: string; osSecret: string \} \| null \{\n    const bridgeUrl = String\(\(this\.env as \{ INDOBASE_BRIDGE_URL\?: string \}\)\.INDOBASE_BRIDGE_URL \|\| ""\)\.trim\(\);\n    const osSecret = String\(\(this\.env as \{ INDOBASE_OS_SECRET\?: string \}\)\.INDOBASE_OS_SECRET \|\| ""\)\.trim\(\);\n    \/\/ #region agent log\n    console\.log\(JSON\.stringify\(\{[\s\S]*?\/\/ #endregion\n    if \(!bridgeUrl \|\| !osSecret\) return null;/
        const bare = `getIndobaseLaunchConfig(): { bridgeUrl: string; osSecret: string } | null {
    const bridgeUrl = String((this.env as { INDOBASE_BRIDGE_URL?: string }).INDOBASE_BRIDGE_URL || "").trim();
    const osSecret = String((this.env as { INDOBASE_OS_SECRET?: string }).INDOBASE_OS_SECRET || "").trim();
    if (!bridgeUrl || !osSecret) return null;`
        if (withProbe.test(text)) {
          text = text.replace(withProbe, bare)
          writeFileSync(overseerPath, text)
          console.log('  overseer.ts ← removed launch_config_probe')
        } else {
          console.log('  overseer getIndobaseLaunchConfig already patched')
        }
      } else {
        console.log('  overseer getIndobaseLaunchConfig already patched')
      }
    } else {
      const anchor = `  getWebFetchEnv(): WebFetchEnv {
    if (this.storage.prohibitAllSharing.get()) {`
      const injection = `  getIndobaseLaunchConfig(): { bridgeUrl: string; osSecret: string } | null {
    const bridgeUrl = String((this.env as { INDOBASE_BRIDGE_URL?: string }).INDOBASE_BRIDGE_URL || "").trim();
    const osSecret = String((this.env as { INDOBASE_OS_SECRET?: string }).INDOBASE_OS_SECRET || "").trim();
    if (!bridgeUrl || !osSecret) return null;
    return { bridgeUrl, osSecret };
  }

  getWebFetchEnv(): WebFetchEnv {
    if (this.storage.prohibitAllSharing.get()) {`
      if (text.includes(anchor)) {
        text = text.replace(anchor, injection)
        writeFileSync(overseerPath, text)
        console.log('  overseer.ts ← getIndobaseLaunchConfig')
      } else {
        console.warn('  skip: overseer getWebFetchEnv anchor drifted')
      }
    }
  }

  if (existsSync(envPath)) {
    let text = readFileSync(envPath, 'utf8')
    if (text.includes('INDOBASE_BRIDGE_URL')) {
      console.log('  env.d.ts already has Indobase launch vars')
    } else {
      // Append to Cloudflare.Env interface if present
      const iface = 'interface Env {'
      const alt = 'type Env ='
      if (text.includes('INDOBASE_BRIDGE_URL')) {
        /* already */
      } else if (text.includes(iface)) {
        text = text.replace(
          iface,
          `${iface}\n      INDOBASE_BRIDGE_URL?: string;\n      INDOBASE_OS_SECRET?: string;`,
        )
        writeFileSync(envPath, text)
        console.log('  env.d.ts ← INDOBASE_BRIDGE_URL / INDOBASE_OS_SECRET')
      } else {
        // workers-types generated style — append ambient
        text +=
          '\n// Indobase launch (AgentTool → bridge)\n' +
          'declare namespace Cloudflare {\n' +
          '  interface Env {\n' +
          '    INDOBASE_BRIDGE_URL?: string;\n' +
          '    INDOBASE_OS_SECRET?: string;\n' +
          '  }\n' +
          '}\n'
        writeFileSync(envPath, text)
        console.log('  env.d.ts ← Cloudflare.Env Indobase launch vars')
      }
    }
  }
}

// --- .dev.vars + workshop-backend wrangler vars for launchBusiness / authStart ---
// Overseer DO runs in workshop-backend. Wrangler multi-config does NOT pass root
// .dev.vars into that service — vars must be in packages/workshop-backend/.dev.vars
// AND/OR wrangler.dev.jsonc "vars" (bindings list confirms the latter works on Vyom).
{
  const bridgeUrlRaw =
    process.env.INDOBASE_BRIDGE_URL?.trim() ||
    process.env.BUILDER_CFOS_PUBLIC_URL?.trim() ||
    'https://builder.indobase.in'
  // Vyom CFOS workerd cannot reach localhost bridge publish — always seed a reachable URL.
  let bridgeUrl = bridgeUrlRaw.replace(/\/+$/, '')
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(bridgeUrl)) {
    console.warn(
      '  WARN: INDOBASE_BRIDGE_URL is loopback — forcing https://builder.indobase.in for CFOS .dev.vars (reseed: /usr/local/sbin/indobase-cfos-seed-indobase-vars.sh)',
    )
    bridgeUrl = 'https://builder.indobase.in'
  }
  const osSecret =
    process.env.INDOBASE_OS_SECRET?.trim() ||
    process.env.BUILDER_CFOS_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    ''
  const upsertDevVars = (path) => {
    let existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
    const upsert = (key, value) => {
      if (!value) return
      const line = `${key}=${value}`
      if (new RegExp(`^${key}=`, 'm').test(existing)) {
        existing = existing.replace(new RegExp(`^${key}=.*$`, 'm'), line)
      } else {
        existing = existing.trimEnd() + (existing.endsWith('\n') || !existing ? '' : '\n') + line + '\n'
      }
    }
    upsert('INDOBASE_BRIDGE_URL', bridgeUrl)
    if (osSecret.length >= 32) upsert('INDOBASE_OS_SECRET', osSecret)
    writeFileSync(path, existing.endsWith('\n') ? existing : existing + '\n', { mode: 0o600 })
  }
  upsertDevVars(join(OS, '.dev.vars'))
  upsertDevVars(join(OS, 'packages/workshop-backend/.dev.vars'))

  const wbWrangler = join(OS, 'packages/workshop-backend/wrangler.dev.jsonc')
  if (existsSync(wbWrangler) && bridgeUrl && osSecret.length >= 32) {
    let text = readFileSync(wbWrangler, 'utf8')
    const setJsoncString = (key, value) => {
      const re = new RegExp(`"${key}"\\s*:\\s*"[^"]*"`)
      const line = `"${key}": ${JSON.stringify(value)}`
      if (re.test(text)) {
        text = text.replace(re, line)
        return
      }
      // Insert after "vars": {
      if (!/"vars"\s*:\s*\{/.test(text)) return
      text = text.replace(/("vars"\s*:\s*\{)/, `$1\n    ${line},`)
    }
    setJsoncString('INDOBASE_BRIDGE_URL', bridgeUrl)
    setJsoncString('INDOBASE_OS_SECRET', osSecret)
    writeFileSync(wbWrangler, text, { mode: 0o600 })
    console.log('  workshop-backend/wrangler.dev.jsonc ← INDOBASE_BRIDGE_URL + INDOBASE_OS_SECRET')
  }

  if (osSecret.length < 32) {
    console.warn('  skip: INDOBASE_OS_SECRET / handoff secret missing or <32 chars')
  }
  console.log(
    '  .dev.vars (+ workshop-backend/) ← INDOBASE_BRIDGE_URL' +
      (osSecret.length >= 32 ? ' + INDOBASE_OS_SECRET' : ''),
  )
}

// --- Local ADMINS: allow seed-format-routing via admin + Indobase auto-login "dev" ---
{
  const path = join(OS, 'run-dev-server.js')
  if (existsSync(path)) {
    let text = readFileSync(path, 'utf8')
    if (text.includes('ADMINS = ["admin", "dev"]') || text.includes("ADMINS = ['admin', 'dev']")) {
      console.log('  ADMINS already includes admin+dev')
    } else if (text.includes('config.vars.ADMINS = ["admin"];')) {
      text = text.replace(
        'config.vars.ADMINS = ["admin"];',
        'config.vars.ADMINS = ["admin", "dev"]; // Indobase: seed-format-routing + auto-login',
      )
      writeFileSync(path, text)
      console.log('  ADMINS ← admin, dev')
    } else {
      console.warn('  skip: ADMINS assignment drifted')
    }
  }
}

// --- Follow-up recommendation chips (competitor-style guided next steps) ---
{
  const feSrc = join(OS, 'packages/workshop-frontend/src')
  const followupsDir = join(feSrc)
  const brandFollowups = join(BRAND, 'followups')
  const chatPath = join(feSrc, 'ChatInterface.tsx')

  if (existsSync(brandFollowups) && existsSync(feSrc)) {
    for (const name of [
      'followups.ts',
      'FollowUpRecommendations.tsx',
      'FollowUpRecommendations.module.css',
      'LaunchJourneyCard.tsx',
      'LaunchJourneyCard.module.css',
    ]) {
      const from = join(brandFollowups, name)
      const to = join(followupsDir, name)
      if (existsSync(from)) {
        copyFileSync(from, to)
      }
    }
    // Prefer bridge parser when developing in the monorepo (unit-tested canonical).
    const bridgeParser = join(ROOT, 'bridge/src/followups.ts')
    if (existsSync(bridgeParser)) {
      copyFileSync(bridgeParser, join(followupsDir, 'followups.ts'))
      copyFileSync(bridgeParser, join(brandFollowups, 'followups.ts'))
    }
    console.log('  copied FollowUpRecommendations → workshop-frontend/src')
  }

  if (existsSync(chatPath)) {
    let text = read(chatPath)
    const importNeedle = 'import styles from "./ChatInterface.module.css";'
    const importInjection =
      'import styles from "./ChatInterface.module.css";\n' +
      'import { FollowUpRecommendations } from "./FollowUpRecommendations"; // Indobase follow-up chips'

    if (text.includes('FollowUpRecommendations') && text.includes('Indobase follow-up chips')) {
      const oldAllow =
        'allowFallback={completedAgentTurnMessageSeqs.has(actionMessageSeq)}'
      const newAllow =
        'allowFallback={completedAgentTurnMessageSeqs.has(actionMessageSeq) || !isAgentActive}'
      if (text.includes(oldAllow) && !text.includes(newAllow)) {
        text = text.replace(oldAllow, newAllow)
      }
      const oldJourney =
        'allowFallback={completedAgentTurnMessageSeqs.has(actionMessageSeq) || !isAgentActive}\n                                  showLaunchJourney={actionMessageSeq === J2}\n                                  disabled={isAgentActive}'
      const newJourney =
        'allowFallback={completedAgentTurnMessageSeqs.has(actionMessageSeq) || !isAgentActive}\n                                  showLaunchJourney={true}\n                                  disabled={isAgentActive}'
      if (text.includes(oldJourney)) {
        text = text.replace(oldJourney, newJourney)
        write(chatPath, text)
        console.log('  ChatInterface ← persistent launch journey card (all turns, singleton sticky)')
      } else if (text.includes('showLaunchJourney={actionMessageSeq === J2}')) {
        text = text.replace(
          'showLaunchJourney={actionMessageSeq === J2}',
          'showLaunchJourney={true}',
        )
        write(chatPath, text)
        console.log('  ChatInterface ← persistent launch journey (replaced J2-only)')
      } else if (text.includes(oldAllow) && !text.includes('showLaunchJourney')) {
        const oldIdle =
          'allowFallback={completedAgentTurnMessageSeqs.has(actionMessageSeq) || !isAgentActive}\n                                  disabled={isAgentActive}'
        const withJourney =
          'allowFallback={completedAgentTurnMessageSeqs.has(actionMessageSeq) || !isAgentActive}\n                                  showLaunchJourney={true}\n                                  disabled={isAgentActive}'
        if (text.includes(oldIdle)) {
          text = text.replace(oldIdle, withJourney)
          write(chatPath, text)
          console.log('  ChatInterface ← launch journey card persistent')
        } else {
          write(chatPath, text)
          console.log('  ChatInterface ← follow-up allowFallback when agent idle')
        }
      } else if (text.includes(oldAllow) && text.includes(newAllow) && !text.includes('showLaunchJourney')) {
        write(chatPath, text)
        console.log('  ChatInterface ← follow-up allowFallback when agent idle')
      } else {
        console.log('  ChatInterface follow-up chips already patched (skip)')
      }
    } else if (text.includes(importNeedle) && !text.includes('FollowUpRecommendations')) {
      text = text.replace(importNeedle, importInjection)

      const oldBlock = `                              {hasMessageText && (
                                <div className={\`text-[14px] leading-[22px] tracking-[-0.25px] text-kumo-default \${styles.markdownContent}\`}>
                                  <MarkdownMessage
                                    message={msg.message}
                                    capsules={msg.capsules}
                                    formats={msg.formats}
                                  />
                                </div>
                              )}`

      const newBlock = `                              {hasMessageText && (
                                <FollowUpRecommendations
                                  message={msg.message}
                                  allowFallback={completedAgentTurnMessageSeqs.has(actionMessageSeq) || !isAgentActive}
                                  showLaunchJourney={true}
                                  disabled={isAgentActive}
                                  onPick={(next) => {
                                    void handleSend(next)
                                  }}
                                >
                                  {(body) => (
                                    <div className={\`text-[14px] leading-[22px] tracking-[-0.25px] text-kumo-default \${styles.markdownContent}\`}>
                                      <MarkdownMessage
                                        message={body}
                                        capsules={msg.capsules}
                                        formats={msg.formats}
                                      />
                                    </div>
                                  )}
                                </FollowUpRecommendations>
                              )}`

      if (text.includes(oldBlock)) {
        text = text.replace(oldBlock, newBlock)
        write(chatPath, text)
        console.log('  ChatInterface ← follow-up recommendation chips')
      } else if (text.includes('Indobase follow-up chips')) {
        write(chatPath, text)
        console.log('  ChatInterface import added; render anchor already patched or drifted')
      } else {
        write(chatPath, text)
        throw new Error(
          'ChatInterface assistant MarkdownMessage anchor drifted — FollowUpRecommendations not wired. Fix rebrand patch.',
        )
      }
    } else if (!text.includes(importNeedle)) {
      throw new Error('ChatInterface styles import drifted — cannot inject FollowUpRecommendations')
    }
  } else {
    throw new Error(`ChatInterface.tsx missing at ${chatPath}`)
  }
}

// --- Soften createGadget ERROR badge (preview workspace fails ≠ launch failed) ---
{
  const chatPath = join(OS, 'packages/workshop-frontend/src/ChatInterface.tsx')
  if (existsSync(chatPath)) {
    let text = read(chatPath)
    const oldHasError = 'hasError: toolCalls.some((tc) => Boolean(tc.error)),'
    const newHasError =
      'hasError: toolCalls.some((tc) => Boolean(tc.error) && tc.toolName !== "createGadget"),'
    if (text.includes(oldHasError)) {
      text = text.replace(oldHasError, newHasError)
      write(chatPath, text)
      console.log('  ChatInterface ← createGadget errors no longer show fatal ERROR badge')
    } else if (text.includes(newHasError)) {
      console.log('  ChatInterface createGadget ERROR soft already patched (skip)')
    } else {
      console.warn('  skip: ChatInterface hasError grouping drifted')
    }
  }
}

// --- Hide thinking / CoT by default (Naive-clean operator chat) ---
{
  const path = join(OS, 'packages/workshop-frontend/src/ChatInterface.tsx')
  if (existsSync(path)) {
    let text = read(path)
    const oldDefault = `function getStoredShowThinkingTraces(): boolean {
  try {
    // Clean up the key this setting replaced.
    window.localStorage.removeItem("expandReasoningByDefault");
    return window.localStorage.getItem(SHOW_THINKING_TRACES_KEY) !== "false";
  } catch {
    return true;
  }
}`
    const newDefault = `function getStoredShowThinkingTraces(): boolean {
  try {
    // Clean up the key this setting replaced.
    window.localStorage.removeItem("expandReasoningByDefault");
    // Indobase: hide CoT / thinking traces by default (operator chat stays clean).
    return window.localStorage.getItem(SHOW_THINKING_TRACES_KEY) === "true";
  } catch {
    return false;
  }
}`
    if (text.includes('Indobase: hide CoT')) {
      console.log('  ChatInterface thinking traces already default-off (skip)')
    } else if (text.includes(oldDefault)) {
      write(path, text.replace(oldDefault, newDefault))
      console.log('  ChatInterface ← hide thinking traces by default')
    } else {
      console.warn('  skip: getStoredShowThinkingTraces anchor drifted')
    }
  }
}

console.log('Done. UI chrome reads as Indobase; LICENSE / Apache attribution untouched.')
console.log(`Smoke: cd ${OS} && pnpm run-local  →  http://localhost:8787`)
