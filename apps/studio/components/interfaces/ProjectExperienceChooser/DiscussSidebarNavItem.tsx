import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/sidebar-icon'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { MessageSquare } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

import { useDiscussLaunch } from './useDiscussLaunch'

export const DiscussSidebarNavItem = () => {
  const { isLaunching, launch } = useDiscussLaunch()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={isLaunching}
        className="text-sm"
        size="default"
        onClick={() => void launch().then((r) => r.ok && r.url && window.location.assign(r.url))}
      >
        <MessageSquare size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
        <span>
          {isLaunching ? 'Opening Discuss…' : ECOSYSTEM_PRODUCTS.discuss.name}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
