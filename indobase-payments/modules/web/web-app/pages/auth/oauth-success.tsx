import { create } from "@bufbuild/protobuf";
import { useEffect } from "react";
import { useSearchParams, useNavigate } from 'react-router-dom'

import { Loading } from "@/components/Loading";
import { useSession } from "@/features/auth";
import { PAYMENTS_RETURN_URL_KEY } from '@/lib/studioAuthRedirect'
import { LoginResponseSchema } from "@/rpc/api/users/v1/users_pb";
import { INVITE_TOKEN_KEY } from '@/pages/invite/acceptInvite'

export const OauthSuccess = () => {

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const token = searchParams.get('token')

  const [, setSession] = useSession()

  useEffect(() => {
    if (token) {
      setSession(create(LoginResponseSchema, { token: token }))
      const storedReturn = sessionStorage.getItem(PAYMENTS_RETURN_URL_KEY)
      const invitePending = sessionStorage.getItem(INVITE_TOKEN_KEY)
      const destination =
        storedReturn ??
        (invitePending ? '/invite-authenticated' : null)

      if (storedReturn) {
        sessionStorage.removeItem(PAYMENTS_RETURN_URL_KEY)
      }

      setTimeout(() => {
        navigate(destination ?? '/')
      }, 50)
    }
  }, [token, navigate, setSession])

  return <Loading/>
}
