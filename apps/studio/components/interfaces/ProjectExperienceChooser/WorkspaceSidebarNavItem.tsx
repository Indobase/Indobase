import Link from 'next/link'

import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/sidebar-icon'
import { useParams } from 'common'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { Briefcase } from 'lucide-react'
import { Badge, SidebarMenuButton, SidebarMenuItem, cn } from 'ui'

export const WorkspaceSidebarNavItem = () => {
  const { ref } = useParams()
  const comingSoon = ECOSYSTEM_PRODUCTS.workspace.comingSoon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn('text-sm', comingSoon && 'opacity-70')}
        size="default"
        asChild
      >
        <Link href={`/project/${ref}/workspace`}>
          <Briefcase size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
          <span className="flex-1">{ECOSYSTEM_PRODUCTS.workspace.name}</span>
          {comingSoon ? (
            <Badge variant="warning" className="text-[10px]">
              Soon
            </Badge>
          ) : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
