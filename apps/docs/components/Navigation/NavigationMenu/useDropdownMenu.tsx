'use client'

import type { User } from '@indobaseinc/indobase-js'
import { isFeatureEnabled, logOut } from 'common'
import { Database, Globe, Home, LifeBuoy, LogOut, Settings, UserIcon } from 'lucide-react'

import type { menuItem } from 'ui-patterns/AuthenticatedDropdownMenu'
import { IconGitHub } from './MenuIcons'

const useDropdownMenu = (user: User | null) => {
  const menu: menuItem[][] = [
    [
      {
        label: user?.email ?? "You're logged in",
        type: 'text',
        icon: UserIcon,
      },
      {
        label: 'Account Preferences',
        icon: Settings,
        href: 'https://indobase.in/dashboard/account/me',
      },
      {
        label: 'All Projects',
        icon: Database,
        href: 'https://indobase.in/dashboard/projects',
      },
    ],
    [
      isFeatureEnabled('docs:navigation_dropdown_links_home')
        ? {
            label: 'Indobase.in',
            icon: Globe,
            href: 'https://indobase.in',
            otherProps: {
              target: '_blank',
              rel: 'noreferrer noopener',
            },
          }
        : {
            label: 'Dashboard',
            icon: Home,
            href: '../dashboard',
          },
      {
        label: 'GitHub',
        icon: IconGitHub as any,
        href: 'https://github.com/Indobase/Indobase',
        otherProps: {
          target: '_blank',
          rel: 'noreferrer noopener',
        },
      },
      {
        label: 'Support',
        icon: LifeBuoy,
        href: 'https://indobase.in/support',
        otherProps: {
          target: '_blank',
          rel: 'noreferrer noopener',
        },
      },
    ],
    [
      {
        label: 'Theme',
        type: 'theme',
      },
    ],
    [
      {
        label: 'Logout',
        type: 'button',
        icon: LogOut,
        onClick: async () => {
          await logOut()
          window.location.reload()
        },
      },
    ],
  ]

  return menu
}

export default useDropdownMenu
