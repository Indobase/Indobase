import { useRouter } from 'next/router'

export function useHideSidebar() {
  const router = useRouter()
  const pathname = router.pathname ?? ''

  const shouldHide =
    pathname.startsWith('/account') ||
    pathname.startsWith('/new') ||
    pathname.startsWith('/support') ||
    pathname === '/organizations' ||
    pathname === '/sign-in'

  return shouldHide
}
