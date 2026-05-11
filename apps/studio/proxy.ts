import {
  FIRST_REFERRER_COOKIE_NAME,
  shouldRefreshCookie,
  stampFirstReferrerCookie,
} from 'common/first-referrer-cookie'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return
  }

  // Belt & suspenders: stamp first-referrer cookie for direct Studio visits.
  // Primary stamping happens in www/docs middleware; this catches edge cases
  // like bookmarked Studio URLs with UTMs or direct-to-Studio paid traffic.
  //
  // IMPORTANT: Only return NextResponse.next() when we actually need to set a
  // cookie. In the multi-zone production setup (www proxies /dashboard/* → Studio),
  // returning an explicit NextResponse.next() unconditionally causes the response
  // to flow through Next.js's middleware response pipeline, which interferes with
  // client-side navigation and triggers full page reloads. Returning undefined
  // lets Next.js handle the request completely untouched.
  const referrer = request.headers.get('referer') ?? ''
  const { stamp } = shouldRefreshCookie(request.cookies.has(FIRST_REFERRER_COOKIE_NAME), {
    referrer,
    url: request.url,
  })

  if (stamp) {
    const response = NextResponse.next()
    stampFirstReferrerCookie(request, response)
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon.ico|__nextjs).*)'],
}
