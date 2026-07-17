import { ICON_SIZE, ICON_STROKE_WIDTH } from 'components/interfaces/Sidebar'
import { Blocks } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from 'ui'

import { useBuilderLaunch } from './useBuilderLaunch'

export const BuilderSidebarNavItem = () => {
  const { isLaunching, launch } = useBuilderLaunch({ nextPath: '/?source=studio' })

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        disabled={isLaunching}
        className="text-sm"
        size="default"
        onClick={() => void launch()}
      >
        <Blocks size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />
        <span>{isLaunching ? 'Opening Builder…' : 'Indobase Builder'}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
