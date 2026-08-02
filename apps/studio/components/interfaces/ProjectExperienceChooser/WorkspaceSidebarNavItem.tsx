import Link from 'next/link'

import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/sidebar-icon'
import { useParams } from 'common'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { Briefcase } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

export const WorkspaceSidebarNavItem = () => {
  const { ref } = useParams()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="text-sm" size="default" asChild>
        <Link href={`/project/${ref}/workspace`}>
          <Briefcase size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
          <span>{ECOSYSTEM_PRODUCTS.workspace.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
