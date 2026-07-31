import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { Video } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

import { useMeetLaunch } from './useMeetLaunch'

export const MeetSidebarNavItem = () => {
  const { isLaunching, launch } = useMeetLaunch()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={isLaunching}
        className="text-sm"
        size="default"
        onClick={() => void launch().then((r) => r.ok && r.url && window.location.assign(r.url))}
      >
        <Video size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
        <span>{isLaunching ? 'Opening Meet…' : ECOSYSTEM_PRODUCTS.meet.name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
