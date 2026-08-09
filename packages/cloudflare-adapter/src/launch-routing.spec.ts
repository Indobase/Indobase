import { describe, expect, it } from 'vitest'
import {
  LAUNCH_AGENT_HARD_RULES,
  LAUNCH_BUSINESS_TOOL,
  LAUNCH_SESSION_HINT,
  assertCanClaimLive,
  assertLaunchHasContent,
  promptLooksLikeGoLiveIntent,
  urlLooksLikeForbiddenHost,
} from './launch-routing'

describe('launch routing (hard Go Live path)', () => {
  it('exposes launchBusiness tool wrapping /api/os/launch', () => {
    expect(LAUNCH_BUSINESS_TOOL.name).toBe('launchBusiness')
    expect(LAUNCH_BUSINESS_TOOL.path).toBe('/api/os/tools/launchBusiness')
    expect(LAUNCH_BUSINESS_TOOL.aliasPath).toBe('/api/os/tools/goLive')
    expect(LAUNCH_BUSINESS_TOOL.wraps).toBe('/api/os/launch')
    expect(LAUNCH_BUSINESS_TOOL.aliases).toContain('goLive')
  })

  it('detects go-live intents', () => {
    expect(promptLooksLikeGoLiveIntent('Please go live now')).toBe(true)
    expect(promptLooksLikeGoLiveIntent('Launch my business')).toBe(true)
    expect(promptLooksLikeGoLiveIntent('make a logo')).toBe(false)
  })

  it('forbids third-party host URLs', () => {
    expect(urlLooksLikeForbiddenHost('https://foo.vercel.app')).toBe(true)
    expect(urlLooksLikeForbiddenHost('https://x.netlify.app')).toBe(true)
    expect(urlLooksLikeForbiddenHost('https://user.github.io/site')).toBe(true)
    expect(urlLooksLikeForbiddenHost('https://aquaharvest.indobase.in')).toBe(false)
    expect(urlLooksLikeForbiddenHost('http://127.0.0.1:8791/live/ref/')).toBe(false)
  })

  it('only allows claiming live with ok + url', () => {
    expect(assertCanClaimLive({ ok: false, url: 'https://a.indobase.in' }).allowed).toBe(false)
    expect(assertCanClaimLive({ ok: true }).allowed).toBe(false)
    expect(assertCanClaimLive({ ok: true, url: '' }).allowed).toBe(false)
    expect(assertCanClaimLive({ ok: true, url: 'https://x.vercel.app' }).allowed).toBe(false)
    expect(assertCanClaimLive({ ok: true, url: 'https://aqua.indobase.in' }).allowed).toBe(true)
    expect(assertCanClaimLive({ ok: true, url: 'http://127.0.0.1:8791/live/x/' }).allowed).toBe(true)
  })

  it('requires real html or files for the agent tool', () => {
    expect(assertLaunchHasContent({}).ok).toBe(false)
    expect(assertLaunchHasContent({ html: '   ' }).ok).toBe(false)
    expect(assertLaunchHasContent({ files: {} }).ok).toBe(false)
    expect(assertLaunchHasContent({ html: '<html></html>' }).ok).toBe(true)
    expect(assertLaunchHasContent({ files: { 'index.html': '<h1>Hi</h1>' } }).ok).toBe(true)
  })

  it('hard rules forbid inventing live URLs and Connect language', () => {
    expect(LAUNCH_AGENT_HARD_RULES).toMatch(/HARD PATH/i)
    expect(LAUNCH_AGENT_HARD_RULES).toMatch(/launchBusiness/)
    expect(LAUNCH_AGENT_HARD_RULES).toMatch(/NEVER invent/i)
    expect(LAUNCH_AGENT_HARD_RULES).toMatch(/sites\.indobase\.in/)
    expect(LAUNCH_AGENT_HARD_RULES).toMatch(/Enable ≠ Connect/)
    expect(LAUNCH_AGENT_HARD_RULES).toMatch(/BEFORE building|ensureLogin|guidedBackend/i)
    expect(LAUNCH_AGENT_HARD_RULES).not.toMatch(/Vercel|Netlify|GitHub Pages/i)
    expect(LAUNCH_SESSION_HINT).toMatch(/ensure/i)
    expect(LAUNCH_SESSION_HINT).toMatch(/HARD PATH/)
  })
})
