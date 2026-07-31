import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { Calendar } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

import { useCalendarLaunch } from './useCalendarLaunch'

export const CalendarSidebarNavItem = () => {
  const { isLaunching, launch } = useCalendarLaunch()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={isLaunching}
        className="text-sm"
        size="default"
        onClick={() => void launch().then((r) => r.ok && r.url && window.location.assign(r.url))}
      >
        <Calendar size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
        <span>
          {isLaunching ? 'Opening Calendar…' : ECOSYSTEM_PRODUCTS.calendar.name}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
