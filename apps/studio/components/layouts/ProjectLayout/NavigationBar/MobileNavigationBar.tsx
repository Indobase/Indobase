import { Menu, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'

import { useParams } from 'common'
import { UserDropdown } from 'components/interfaces/UserDropdown'
import { FeedbackDropdown } from 'components/layouts/ProjectLayout/LayoutHeader/FeedbackDropdown/FeedbackDropdown'
import { HelpDropdown } from 'components/layouts/ProjectLayout/LayoutHeader/HelpDropdown/HelpDropdown'
import { SidebarContent } from 'components/interfaces/Sidebar'
import { OrganizationDropdown } from 'components/layouts/AppLayout/OrganizationDropdown'
import { IS_SAAS } from 'lib/constants'
import { Button, cn } from 'ui'
import { CommandMenuTrigger } from 'ui-patterns'
import MobileSheetNav from 'ui-patterns/MobileSheetNav/MobileSheetNav'

export const ICON_SIZE = 20
export const ICON_STROKE_WIDTH = 1.5

const MobileNavigationBar = ({
  hideMobileMenu,
  showOrgContext = false,
}: {
  hideMobileMenu?: boolean
  showOrgContext?: boolean
}) => {
  const router = useRouter()
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const { ref: projectRef } = useParams()

  return (
    <div className="h-14 w-full flex flex-row md:hidden border-b bg-dash-sidebar border-default">
      <nav
        className={cn(
          'group px-3 z-10 w-full h-14',
          'transition-width duration-200',
          'hide-scrollbar flex flex-row items-center justify-between overflow-x-auto gap-2'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={IS_SAAS ? '/organizations' : `/project/${projectRef}`}
            className="flex items-center h-[26px] w-[26px] min-w-[26px]"
            aria-label="Indobase home"
          >
            <img
              alt=""
              aria-hidden
              src={`${router.basePath}/img/indobase-mark.png`}
              className="h-[26px] w-[26px] cursor-pointer rounded object-contain"
            />
          </Link>
          {showOrgContext && (
            <div className="min-w-0">
              <OrganizationDropdown />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <CommandMenuTrigger>
            <button
              type="button"
              aria-label="Open command menu"
              className={cn(
                'group',
                'h-11 w-11 rounded-md',
                'p-2',
                'flex items-center justify-center',
                'bg-transparent border-none text-foreground-lighter',
                'hover:bg-opacity-100 hover:border-strong hover:text-foreground-light',
                'focus-visible:!outline-4 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                'transition'
              )}
            >
              <Search size={18} strokeWidth={2} />
            </button>
          </CommandMenuTrigger>
          <HelpDropdown />
          <FeedbackDropdown />
          <UserDropdown />
          {!hideMobileMenu && (
            <Button
              type="default"
              aria-label="Open project navigation"
              className="flex lg:hidden border-default bg-surface-100/75 text-foreground-light rounded-md min-w-[44px] w-[44px] h-[44px] data-[state=open]:bg-overlay-hover/30"
              icon={<Menu />}
              onClick={() => setIsSheetOpen(true)}
            />
          )}
        </div>
      </nav>
      <MobileSheetNav open={isSheetOpen} onOpenChange={setIsSheetOpen} data-state="expanded">
        <SidebarContent />
      </MobileSheetNav>
    </div>
  )
}

export default MobileNavigationBar
