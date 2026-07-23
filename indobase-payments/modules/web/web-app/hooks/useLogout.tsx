import { useSession } from '@/features/auth'
import { redirectToStudioSignIn } from '@/lib/studioAuthRedirect'
import { queryClient } from '@/lib/react-query'

export function useLogout() {
  const [, , clearSession] = useSession()

  return (message?: string) => {
    if (message) {
      console.error(`${message}, redirecting to Studio sign-in`)
    }
    queryClient.clear()
    clearSession()
    redirectToStudioSignIn()
    // Caller may render the return value while navigation starts.
    return null
  }
}
