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
      if (name === 'node_modules') continue
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) out.push(...walk(p))
      else if (/\.(ts|tsx|html)$/.test(name) && name !== 'worker-configuration.d.ts') out.push(p)
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

console.log('Done. UI chrome reads as Indobase; LICENSE / Apache attribution untouched.')
console.log(`Smoke: cd ${OS} && pnpm run-local  →  http://localhost:8787`)
