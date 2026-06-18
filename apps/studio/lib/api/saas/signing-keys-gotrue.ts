import { decryptString } from './util'
import { executeQuery } from './query'

type SigningKeyRow = {
  id: string
  algorithm: string
  status: string
  public_jwk: Record<string, unknown> | null
  private_jwk_enc: string | null
}

function stripPrivateFields(jwk: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...jwk }
  delete copy.d
  delete copy.p
  delete copy.q
  delete copy.dp
  delete copy.dq
  delete copy.qi
  delete copy.k
  copy.key_ops = ['verify']
  return copy
}

export async function buildGotrueJwtKeysJson(projectRef: string): Promise<string | null> {
  const rows = await executeQuery<SigningKeyRow>({
    query: `
      select k.id, k.algorithm, k.status, k.public_jwk, k.private_jwk_enc
      from saas.project_jwt_signing_keys k
      join saas.projects p on p.id = k.project_id
      where p.ref = $1
        and k.status in ('in_use', 'standby', 'previously_used')
      order by case k.status
        when 'in_use' then 0
        when 'standby' then 1
        else 2
      end,
      k.created_at asc
    `,
    parameters: [projectRef],
  })
  if (rows.error) throw rows.error
  if (!rows.data?.length) return null

  const jwks: Record<string, unknown>[] = []

  for (const row of rows.data) {
    if (row.status === 'revoked') continue

    if (row.status === 'previously_used') {
      if (row.public_jwk) {
        jwks.push(stripPrivateFields({ ...row.public_jwk, kid: row.id, alg: row.algorithm }))
      }
      continue
    }

    const enc = row.private_jwk_enc?.trim()
    if (!enc) continue
    const privateJwk = JSON.parse(decryptString(enc)) as Record<string, unknown>
    privateJwk.kid = row.id
    privateJwk.alg = row.algorithm
    privateJwk.key_ops = ['sign', 'verify']
    jwks.push(privateJwk)
  }

  if (!jwks.length) return null
  return JSON.stringify(jwks)
}
