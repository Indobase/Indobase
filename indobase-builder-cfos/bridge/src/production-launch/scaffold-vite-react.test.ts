import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { inferBusinessSpec } from '../ux/business-spec.ts'
import {
  requiredVerifiersFailed,
  runEcommerceStaticVerifiers,
} from '../delivery/ecommerce-verifiers.ts'
import {
  applyPreviewMutationToFiles,
  injectSaasRuntimeIntoHtml,
  parsePreviewMutation,
  saasAppHasRuntimeAbi,
} from '../ux/preview-artifact.ts'
import { isViteReactProject } from './react-project.ts'
import { resolveViteProjectFiles, scaffoldViteReactProject } from './scaffold-vite-react.ts'

describe('scaffoldViteReactProject', () => {
  it('builds a Vite + React tree for a grocery store', () => {
    const spec = inferBusinessSpec('create me a ecommerce site for a masala store called Spice Route')
    const files = scaffoldViteReactProject(spec, 'proj_spice')
    assert.equal(isViteReactProject(files), true)
    assert.match(files['src/App.tsx'] || '', /Spice Route|masala|spice|grocery/i)
    assert.match(files['package.json'] || '', /"vite build"/)
    assert.match(files['vite.config.ts'] || '', /base:\s*['"]\.\/['"]/)
    assert.match(files['index.html'] || '', /data-ib-project="proj_spice"/)
    assert.doesNotMatch(files['src/App.tsx'] || '', /Circuit Nest|PocketBase|react-native/i)
  })

  it('scaffolds SaaS and landing without commerce cart', () => {
    const saas = scaffoldViteReactProject(
      inferBusinessSpec('Build a SaaS invoicing app called TutorDesk'),
      'proj_tutor',
    )
    assert.equal(isViteReactProject(saas), true)
    assert.match(saas['src/App.tsx'] || '', /TutorDesk|sign-in/i)
    assert.doesNotMatch(saas['src/App.tsx'] || '', /Add to cart/)

    const landing = scaffoldViteReactProject(
      inferBusinessSpec('Launch a photography studio website called Harbor Studio'),
      'proj_harbor',
    )
    assert.equal(isViteReactProject(landing), true)
    assert.match(landing['src/App.tsx'] || '', /Harbor Studio/)
  })

  it('scaffolded SaaS sign-in is wired to the auth ABI, not a dead button', () => {
    const files = scaffoldViteReactProject(
      inferBusinessSpec('Build a SaaS invoicing app called TutorDesk'),
      'proj_signin',
    )
    const app = files['src/App.tsx'] || ''
    const auth = files['src/auth.ts'] || ''

    // Both steps of the flow are reachable from the UI.
    assert.match(app, /onClick=\{sendCode\}/)
    assert.match(app, /onClick=\{confirmCode\}/)
    assert.match(auth, /indobase\?\.auth|indobase\?: \{ auth/)
    assert.match(auth, /startOtp/)
    assert.match(auth, /verify\(/)
    // No button in the sign-in view is left without a handler.
    for (const button of app.match(/<button[\s\S]*?>/g) || []) {
      assert.match(button, /onClick=/, `button without a handler: ${button}`)
    }
  })

  it('SaaS runtime posts to the published records base, not a relative path', () => {
    const wired = injectSaasRuntimeIntoHtml(
      '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>',
    )
    assert.equal(saasAppHasRuntimeAbi(wired), true)
    assert.match(wired, /INDOBASE_URL\|\|env\.INDOBASE_RECORDS_BASE|INDOBASE_URL/)
    assert.match(wired, /request-otp/)
    assert.match(wired, /auth-with-otp/)
    // The fetch target is built from the env base rather than a bare path.
    assert.match(wired, /fetch\(api\+path/)
  })

  it('scaffolded landing page captures an enquiry instead of showing a dead form', () => {
    const files = scaffoldViteReactProject(
      inferBusinessSpec('Launch a photography studio website called Harbor Studio'),
      'proj_leadform',
    )
    const app = files['src/App.tsx'] || ''
    const leads = files['src/leads.ts'] || ''

    assert.match(app, /<form onSubmit=\{submit\}/)
    assert.match(app, /sendEnquiry\(enquiry\)/)
    assert.match(app, /validateEnquiry\(enquiry\)/)
    // Every field the visitor fills is bound to state, so nothing is lost on submit.
    for (const field of ['name', 'email', 'phone', 'message']) {
      assert.match(app, new RegExp(`update\\('${field}'`), `field not bound: ${field}`)
    }
    // The visitor is told what happened either way.
    assert.match(app, /role="status"/)
    assert.match(app, /role="alert"/)
    assert.match(leads, /indobase\?\.leads/)
    assert.doesNotMatch(leads, /api\/collections/)
  })

  it('every scaffold has exactly one hero heading for MODIFY to edit', () => {
    for (const prompt of [
      'create me a ecommerce site for a masala store called Spice Route',
      'Build a SaaS invoicing app called TutorDesk',
      'Launch a photography studio website called Harbor Studio',
    ]) {
      const app = scaffoldViteReactProject(inferBusinessSpec(prompt), 'proj_hero')['src/App.tsx'] || ''
      assert.equal((app.match(/<h1>/g) || []).length, 1, `expected one <h1> for: ${prompt}`)
      assert.equal(
        (app.match(/data-ib-section="hero"/g) || []).length,
        1,
        `expected one hero marker for: ${prompt}`,
      )
    }
  })

  it('no scaffold ships an anchor that points nowhere', () => {
    const specs = [
      'create me a ecommerce site for a masala store called Spice Route',
      'Build a SaaS invoicing app called TutorDesk',
      'Launch a photography studio website called Harbor Studio',
    ]
    for (const prompt of specs) {
      const app = scaffoldViteReactProject(inferBusinessSpec(prompt), 'proj_links')['src/App.tsx'] || ''
      const hrefs = [...app.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
      for (const href of hrefs) {
        assert.ok(href.startsWith('#'), `${prompt}: unexpected off-site or unrouted link ${href}`)
        const id = href.slice(1)
        assert.match(app, new RegExp(`id="${id}"`), `${prompt}: ${href} has no target`)
      }
    }
  })

  it('scaffolded store passes the Go Live release gate', () => {
    const spec = inferBusinessSpec('create me a ecommerce site for a masala store called Spice Route')
    const files = scaffoldViteReactProject(spec, 'proj_gate')
    const failures = requiredVerifiersFailed(
      runEcommerceStaticVerifiers({ html: files['index.html'], files, projectRef: 'proj_gate' }),
    )
    assert.deepEqual(
      failures.map((f) => f.id),
      [],
    )
    // The gate reads compiled dist, where minifiers rename locals but keep string
    // literals — so the checkout endpoint must appear as a literal in the source.
    assert.match(files['src/commerce.ts'] || '', /'\/api\/os\/commerce\/checkout'/)
  })

  it('scaffolded store checks out through the Commerce ABI, never PocketBase', () => {
    const spec = inferBusinessSpec('Launch an online store called Nadu Foods')
    const files = scaffoldViteReactProject(spec, 'proj_checkout')
    const source = (files['src/App.tsx'] || '') + (files['src/commerce.ts'] || '')
    assert.match(source, /commerce\.checkout\.create/)
    assert.match(source, /commerce\.products\.list/)
    assert.doesNotMatch(source, /api\/collections|pocketbase|razorpay|stripe/i)
    // The server prices every order: the client sends ids and quantities only.
    assert.doesNotMatch(source, /(?:amountMinor|unitPrice|clientPrice|total)\s*[:=]\s*\w/i)
  })

  it('MODIFY can edit the scaffold BUILD produces', () => {
    const spec = inferBusinessSpec('create me a ecommerce site for a masala store called Spice Route')
    const files = scaffoldViteReactProject(spec, 'proj_modify')

    for (const message of [
      'change the headline to Fresh masala, delivered daily',
      'change the tagline to Ground this morning',
      'change the accent color to #C2410C',
      'make the hero shorter',
      'rename the store to Nadu Spice Co',
    ]) {
      const mutation = parsePreviewMutation(message)
      assert.ok(mutation, `no mutation parsed for: ${message}`)
      const result = applyPreviewMutationToFiles(files, mutation)
      assert.equal(result.mutated, true, `MODIFY did not change the scaffold for: ${message}`)
    }
  })

  it('shortening a hero whose headline is already short drops the subcopy', () => {
    const spec = inferBusinessSpec('create me a ecommerce site for a masala store called Spice Route')
    const files = scaffoldViteReactProject(spec, 'proj_short')
    const heroBlock = (source: string) =>
      /<header[^>]*data-ib-section="hero"[\s\S]*?<\/header>/.exec(source)?.[0] || ''
    assert.match(heroBlock(files['src/App.tsx'] || ''), /<p[^>]*>/)

    const mutation = parsePreviewMutation('make the hero shorter')
    assert.ok(mutation)
    const after = applyPreviewMutationToFiles(files, mutation).files['src/App.tsx'] || ''
    assert.match(after, /<h1>Spice Route<\/h1>/)
    assert.doesNotMatch(heroBlock(after), /<p[^>]*>/)
    // Product copy in the next section is untouched.
    assert.match(after, /\{product\.description\}/)

    // A later tagline edit restores hero subcopy instead of overwriting product copy.
    const retagged = applyPreviewMutationToFiles(
      { ...files, 'src/App.tsx': after },
      parsePreviewMutation('change the tagline to Ground today')!,
    ).files['src/App.tsx'] || ''
    assert.match(heroBlock(retagged), /<p>Ground today<\/p>/)
    assert.match(retagged, /\{product\.description\}/)
  })

  it('resolveViteProjectFiles keeps an existing Vite tree', () => {
    const existing = scaffoldViteReactProject(
      inferBusinessSpec('Launch a store called KeepMe'),
      'proj_keep',
    )
    existing['src/App.tsx'] = 'export default function App(){return <h1>KeepMe</h1>}'
    const resolved = resolveViteProjectFiles(existing, inferBusinessSpec('other'), 'proj_keep')
    assert.equal(resolved.scaffolded, false)
    assert.match(resolved.files['src/App.tsx'] || '', /KeepMe/)
  })
})
