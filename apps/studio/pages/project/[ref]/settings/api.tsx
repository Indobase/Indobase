import { useParams } from 'common'
import { IS_SAAS } from 'lib/constants'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

import type { NextPageWithLayout } from '@/types'

const ApiSettings: NextPageWithLayout = () => {
  const router = useRouter()
  const { ref } = useParams()

  useEffect(() => {
    if (!ref) return
    if (IS_SAAS) {
      router.replace(`/project/${ref}/integrations/data_api/overview`)
    } else {
      router.replace(`/project/${ref}/settings/general`)
    }
  }, [ref, router])

  return null
}

export default ApiSettings
