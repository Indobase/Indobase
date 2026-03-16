import jwt from 'jsonwebtoken'

/**
 * Small helper to generate Indobase-branded JWT keys.
 *
 * Expects AUTH_JWT_SECRET in the environment.
 *
 * Usage (from docker/ or repo root):
 *   AUTH_JWT_SECRET=... node docker/gen-indobase-keys.mjs
 *
 * Prints:
 *   ANON_KEY=...
 *   SERVICE_ROLE_KEY=...
 */

const SECRET = process.env.AUTH_JWT_SECRET

if (!SECRET) {
  console.error('AUTH_JWT_SECRET is required')
  process.exit(1)
}

function makeToken(role) {
  return jwt.sign(
    {
      role,
      iss: 'indobase',
    },
    SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '10y',
    }
  )
}

console.log('ANON_KEY=' + makeToken('anon'))
console.log('SERVICE_ROLE_KEY=' + makeToken('service_role'))

