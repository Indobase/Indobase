import { describe, expect, it } from 'vitest'
import { canTransitionLifecycle, lifecycleAllowsLiveSpeech, emptyApplicationLifecycle, applyLifecycleTransition } from './lifecycle'
import { verifyPreviewHttp } from './verification'

describe('application lifecycle', () => {
  it('cannot jump from preview_ready to live', () => {
    expect(canTransitionLifecycle('preview_ready', 'live')).toBe(false)
    expect(canTransitionLifecycle('building', 'live')).toBe(false)
    expect(canTransitionLifecycle('verifying', 'live')).toBe(false)
    expect(canTransitionLifecycle('verified', 'live')).toBe(false)
    expect(canTransitionLifecycle('launching', 'live')).toBe(true)
    expect(lifecycleAllowsLiveSpeech('preview_ready')).toBe(false)
    expect(lifecycleAllowsLiveSpeech('live')).toBe(true)
  })

  it('treats blank HTML as a failed preview even when HTTP is 200', () => {
    const result = verifyPreviewHttp({ statusCode: 200, body: 'ok', expectedProjectRef: 'p1' })
    expect(result.passed).toBe(false)
    expect(result.preview.reachable).toBe(true)
    expect(result.preview.rendered).toBe(false)
  })

  it('applyLifecycleTransition requires verifying before live', () => {
    const start = emptyApplicationLifecycle('proj_x')
    const building = applyLifecycleTransition(start, 'building')
    expect(building.ok).toBe(true)
    if (!building.ok) return
    const preview = applyLifecycleTransition(building.record, 'preview_ready')
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(applyLifecycleTransition(preview.record, 'live').ok).toBe(false)
    const verifying = applyLifecycleTransition(preview.record, 'verifying')
    expect(verifying.ok).toBe(true)
    if (!verifying.ok) return
    const verified = applyLifecycleTransition(verifying.record, 'verified')
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    const launching = applyLifecycleTransition(verified.record, 'launching')
    expect(launching.ok).toBe(true)
    if (!launching.ok) return
    const live = applyLifecycleTransition(launching.record, 'live', { artifactHash: 'abc' })
    expect(live.ok).toBe(true)
    if (!live.ok) return
    expect(live.record.liveArtifactHash).toBe('abc')
  })
})
