import { createHmac } from 'node:crypto'
import {
  verifyStudioHandoff, createSessionToken, readSessionToken,
  readCookie, resolveHandoffSecret,
} from '../src/server/auth.js'

const SECRET = 'x'.repeat(40)
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64')
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')

function mint(payload: Record<string, unknown>, secret = SECRET) {
  const h = b64({ alg:'HS256', typ:'JWT' }), p = b64(payload)
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest()
    .toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
  return `${h}.${p}.${s}`
}
const now = Math.floor(Date.now()/1000)
const base = {
  aud:'indobase-design', sub:'user-1', email:'a@b.in', project_ref:'proj_abc',
  organization_slug:'acme', role:'admin', iat:now, exp:now+300,
}

let pass = 0, fail = 0
const chk = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}`) }
}

chk('valid token accepted', verifyStudioHandoff(mint(base), SECRET)?.sub === 'user-1')
chk('project_ref extracted', verifyStudioHandoff(mint(base), SECRET)?.project_ref === 'proj_abc')
chk('tampered signature rejected', verifyStudioHandoff(mint(base).slice(0,-3)+'aaa', SECRET) === null)
chk('wrong secret rejected', verifyStudioHandoff(mint(base, 'y'.repeat(40)), SECRET) === null)
chk('expired rejected', verifyStudioHandoff(mint({...base, exp: now-10}), SECRET) === null)
chk('wrong audience rejected', verifyStudioHandoff(mint({...base, aud:'indobase-payments'}), SECRET) === null)
chk('missing role rejected', verifyStudioHandoff(mint({...base, role: undefined}), SECRET) === null)
chk('bogus role rejected', verifyStudioHandoff(mint({...base, role:'superuser'}), SECRET) === null)
chk('missing project_ref rejected', verifyStudioHandoff(mint({...base, project_ref: undefined}), SECRET) === null)
chk('garbage rejected', verifyStudioHandoff('not.a.token', SECRET) === null)

// session round-trip + role gating
const claims = verifyStudioHandoff(mint(base), SECRET)!
const st = createSessionToken(claims, SECRET)
const sess = readSessionToken(st, SECRET)
chk('session round-trip preserves tenant', sess?.projectRef === 'proj_abc' && sess?.gotrueId === 'user-1')
chk('admin canEdit', sess?.canEdit === true)
const vClaims = verifyStudioHandoff(mint({...base, role:'viewer'}), SECRET)!
chk('viewer canEdit=false', readSessionToken(createSessionToken(vClaims, SECRET), SECRET)?.canEdit === false)
chk('tampered session rejected', readSessionToken(st.slice(0,-3)+'aaa', SECRET) === null)
chk('session signed with other secret rejected', readSessionToken(createSessionToken(claims,'z'.repeat(40)), SECRET) === null)
chk('cookie parse', readCookie('a=1; indobase_design_session=abc; b=2') === 'abc')

// fail-closed on weak secret
let threw = false
try { process.env.DESIGN_HANDOFF_SECRET='short'; resolveHandoffSecret() } catch { threw = true }
chk('weak secret fails closed', threw)

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
