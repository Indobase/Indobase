import Link from 'next/link'

import { useParams } from 'common'
import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { TrendingUp } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

/** CRM is a Studio route — no SSO handoff. */
export const CrmSidebarNavItem = () => {
  const { ref } = useParams()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="text-sm" size="default" asChild>
        <Link href={`/project/${ref}/crm`}>
          <TrendingUp size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
          <span>{ECOSYSTEM_PRODUCTS.crm.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
