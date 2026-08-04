import Link from 'next/link'

import { useParams } from 'common'
import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { Globe } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

/** Domains project hub — Studio route that SSO-launches the Domains product. */
export const DomainsSidebarNavItem = () => {
  const { ref } = useParams()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="text-sm" size="default" asChild>
        <Link href={`/project/${ref}/domains`}>
          <Globe size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
          <span>{ECOSYSTEM_PRODUCTS.domains.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
