import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { ECOSYSTEM_PRODUCTS } from 'lib/constants/ecosystem-products'
import { TrendingUp } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

import { useCrmLaunch } from './useCrmLaunch'

export const CrmSidebarNavItem = () => {
  const { isLaunching, launch } = useCrmLaunch()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={isLaunching}
        className="text-sm"
        size="default"
        onClick={() => void launch().then((r) => r.ok && r.url && window.location.assign(r.url))}
      >
        <TrendingUp size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
        <span>{isLaunching ? 'Opening CRM…' : ECOSYSTEM_PRODUCTS.crm.name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
