/**
 * LIVE speech is produced only by this module.
 * Chat, followups, and job.status must not mint a LiveClaim.
 */

export type LiveClaim = {
  projectRef: string
  artifactId: string
  artifactHash: string
  deploymentId: string
  smokeTestId: string
  liveUrl: string
  issuedAt: string
}

export type LiveClaimEvidence = {
  projectRef: string
  lifecycleState?: string | null
  verifiedArtifactId?: string | null
  verifiedArtifactHash?: string | null
  deployedArtifactId?: string | null
  deployedArtifactHash?: string | null
  liveUrl?: string | null
  liveHttpOk?: boolean | null
  smokeOk?: boolean | null
  deploymentId?: string | null
  smokeTestId?: string | null
}

export function assertCanClaimLive(
  evidence: LiveClaimEvidence,
): { ok: true; claim: LiveClaim } | { ok: false; error: string } {
  const projectRef = (evidence.projectRef || '').trim()
  if (!projectRef) return { ok: false, error: 'live_claim.projectRef' }
  if (
    evidence.lifecycleState &&
    evidence.lifecycleState !== 'live' &&
    evidence.lifecycleState !== 'launching'
  ) {
    return { ok: false, error: 'live_claim.lifecycle' }
  }
  const verified = (evidence.verifiedArtifactHash || '').trim()
  const deployed = (evidence.deployedArtifactHash || verified).trim()
  if (!verified || !deployed) return { ok: false, error: 'live_claim.artifact' }
  if (verified !== deployed) return { ok: false, error: 'live_claim.hash_mismatch' }
  const artifactId = (evidence.deployedArtifactId || evidence.verifiedArtifactId || '').trim()
  if (!artifactId) return { ok: false, error: 'live_claim.artifactId' }
  const liveUrl = (evidence.liveUrl || '').trim()
  if (!liveUrl) return { ok: false, error: 'live_claim.url' }
  if (evidence.liveHttpOk !== true) return { ok: false, error: 'live_claim.http' }
  if (evidence.smokeOk !== true) return { ok: false, error: 'live_claim.smoke' }
  const deploymentId = (evidence.deploymentId || '').trim()
  const smokeTestId = (evidence.smokeTestId || '').trim()
  if (!deploymentId || !smokeTestId) return { ok: false, error: 'live_claim.ids' }
  return {
    ok: true,
    claim: {
      projectRef,
      artifactId,
      artifactHash: deployed,
      deploymentId,
      smokeTestId,
      liveUrl,
      issuedAt: new Date().toISOString(),
    },
  }
}

export function liveClaimAllowsSpeech(claim: LiveClaim | null | undefined): boolean {
  if (!claim) return false
  return Boolean(claim.projectRef && claim.artifactHash && claim.liveUrl && claim.deploymentId && claim.smokeTestId)
}
