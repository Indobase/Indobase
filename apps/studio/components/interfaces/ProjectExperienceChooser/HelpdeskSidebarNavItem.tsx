import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { LifeBuoy } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

import { useHelpdeskLaunch } from './useHelpdeskLaunch'

export const HelpdeskSidebarNavItem = () => {
  const { isLaunching, launch } = useHelpdeskLaunch()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={isLaunching}
        className="text-sm"
        size="default"
        onClick={() => void launch().then((r) => r.ok && r.url && window.location.assign(r.url))}
      >
        <LifeBuoy size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
        <span>{isLaunching ? 'Opening Helpdesk…' : ECOSYSTEM_PRODUCTS.helpdesk.name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
