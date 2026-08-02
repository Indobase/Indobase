import Link from 'next/link'

import { useParams } from 'common'
import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { MessageSquare } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

/**
 * Discuss is a Studio route, not a launched external product. No handoff, no second session —
 * so this is a plain <Link>, exactly like the Workspace item.
 */
export const DiscussSidebarNavItem = () => {
  const { ref } = useParams()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton className="text-sm" size="default" asChild>
        <Link href={`/project/${ref}/discuss`}>
          <MessageSquare size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
          <span>{ECOSYSTEM_PRODUCTS.discuss.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
