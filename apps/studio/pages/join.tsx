import Link from 'next/link'

import { OrganizationInvite } from 'components/interfaces/OrganizationInvite/OrganizationInvite'
import { BASE_PATH } from 'lib/constants'
import { useEffect, useMemo, useState } from 'react'
import type { NextPageWithLayout } from 'types'
import { cn } from 'ui'

const JoinOrganizationPage: NextPageWithLayout = () => {
  const [mounted, setMounted] = useState(false)

  const imgUrl = useMemo(() => `${BASE_PATH}/img/indobase-brand.png`, [])

  useEffect(() => setMounted(true), [])

  return (
    <>
      <Link href="/organizations" className="flex items-center justify-center gap-4">
        {mounted && (
          <img src={imgUrl} alt="Indobase Logo" className="block h-[32px] w-auto cursor-pointer rounded" />
        )}
      </Link>
      <OrganizationInvite />
    </>
  )
}

JoinOrganizationPage.getLayout = (page) => (
  <div
    className={cn(
      'flex h-full min-h-screen bg-studio',
      'w-full flex-col place-items-center',
      'items-center justify-center gap-8 px-5'
    )}
  >
    {page}
  </div>
)

export default JoinOrganizationPage
