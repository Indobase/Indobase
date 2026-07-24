import { LOCAL_STORAGE_KEYS, useParams } from 'common'
import { AppBannerWrapper } from 'components/interfaces/App/AppBannerWrapper'
import { BackendStudioUpgradeGate } from 'components/interfaces/Billing/BackendStudioUpgradeGate'
import { Sidebar } from 'components/interfaces/Sidebar'
import { useBackendStudioAccess } from 'hooks/misc/useBackendStudioAccess'
import { useLocalStorageQuery } from 'hooks/misc/useLocalStorage'
import { useCheckLatestDeploy } from 'hooks/use-check-latest-deploy'
import { useRouter } from 'next/router'
import { PropsWithChildren, useEffect, useState } from 'react'
import { useAppStateSnapshot } from 'state/app-state'
import { ResizablePanel, ResizablePanelGroup, SidebarProvider } from 'ui'

import { BannerStack } from '../ui/BannerStack/BannerStack'
import { BannerStackProvider } from '../ui/BannerStack/BannerStackProvider'
import { LayoutHeader } from './ProjectLayout/LayoutHeader/LayoutHeader'
import { LayoutSidebar } from './ProjectLayout/LayoutSidebar'
import { LayoutSidebarProvider } from './ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import MobileNavigationBar from './ProjectLayout/NavigationBar/MobileNavigationBar'
import { ProjectContextProvider } from './ProjectLayout/ProjectContext'

export interface DefaultLayoutProps {
  headerTitle?: string
  hideMobileMenu?: boolean
}

/**
 * Base layout for all project pages in the dashboard, rendered as the first child on all page files within a project.
 *
 * A second layout as the child to this is required, and the layout depends on which section of the dashboard the page is on. (e.g Auth - AuthLayout)
 *
 * The base layout handles rendering the following UI components:
 * - App banner (e.g for notices or incidents)
 * - Mobile navigation bar
 * - First level side navigation bar (e.g For navigating to Table Editor, SQL Editor, Database page, etc)
 */
export const DefaultLayout = ({
  children,
  headerTitle,
  hideMobileMenu,
}: PropsWithChildren<DefaultLayoutProps>) => {
  const { ref } = useParams()
  const router = useRouter()
  const appSnap = useAppStateSnapshot()
  const { hasAccess: hasBackendStudioAccess, enabled: studioGateEnabled } = useBackendStudioAccess()
  const studioLocked = studioGateEnabled && !hasBackendStudioAccess
  const isProjectExperienceChooser = router.pathname === '/project/[ref]'
  // Payments + Marketing are project product surfaces (same Studio session), not Backend Studio.
  const isProjectPayments = router.pathname === '/project/[ref]/payments'
  const isProjectMarketing = router.pathname === '/project/[ref]/marketing'
  const isUngatedProjectSurface =
    isProjectExperienceChooser || isProjectPayments || isProjectMarketing
  const showProductMenu = !!ref && !isUngatedProjectSurface && !studioLocked

  const [lastVisitedOrganization] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
    ''
  )

  const backToDashboardURL =
    appSnap.lastRouteBeforeVisitingAccountPage.length > 0
      ? appSnap.lastRouteBeforeVisitingAccountPage
      : !!lastVisitedOrganization
        ? `/org/${lastVisitedOrganization}`
        : '/organizations'

  useCheckLatestDeploy()

  const contentMinSizePercentage = 50
  const contentMaxSizePercentage = 70

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  /*
   * The project landing page is the Builder/Studio chooser — it is not a backend screen, and every
   * item in the sidebar (Table Editor, SQL Editor, Auth, Storage…) navigates into Studio. Showing it
   * there presents the backend as the default context before the user has chosen one, so the
   * sidebar now appears only once they are actually inside the backend. Indobase Payments and
   * Marketing are the same kind of product surface (not Backend Studio), so they stay sidebar-free.
   */
  const showProjectSidebar =
    !router.pathname.startsWith('/account') && !studioLocked && !isUngatedProjectSurface

  // Chooser + Payments + Marketing stay reachable on every plan. Gate only Backend Studio routes.
  const content = isUngatedProjectSurface ? (
    children
  ) : (
    <BackendStudioUpgradeGate>{children}</BackendStudioUpgradeGate>
  )

  // Resizable panels render at 50% before settling; show a stable shell on first paint.
  if (!isMounted) {
    return (
      <SidebarProvider defaultOpen={false}>
        <LayoutSidebarProvider>
          <ProjectContextProvider projectRef={ref}>
            <BannerStackProvider>
              <div className="flex flex-col h-screen w-screen">
                <AppBannerWrapper />
                <div className="flex-shrink-0">
                  <MobileNavigationBar hideMobileMenu={hideMobileMenu || studioLocked} />
                  <LayoutHeader
                    showProductMenu={showProductMenu}
                    headerTitle={headerTitle}
                    backToDashboardURL={
                      router.pathname.startsWith('/account') ? backToDashboardURL : undefined
                    }
                  />
                </div>
                <div className="flex flex-1 w-full overflow-y-hidden">
                  {showProjectSidebar && <Sidebar />}
                  <div className="h-full flex-1 overflow-y-auto">{content}</div>
                </div>
              </div>
              <BannerStack />
            </BannerStackProvider>
          </ProjectContextProvider>
        </LayoutSidebarProvider>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <LayoutSidebarProvider>
        <ProjectContextProvider projectRef={ref}>
          <BannerStackProvider>
            <div className="flex flex-col h-screen w-screen">
              <AppBannerWrapper />
              <div className="flex-shrink-0">
                <MobileNavigationBar hideMobileMenu={hideMobileMenu || studioLocked} />
                <LayoutHeader
                  showProductMenu={showProductMenu}
                  headerTitle={headerTitle}
                  backToDashboardURL={
                    router.pathname.startsWith('/account') ? backToDashboardURL : undefined
                  }
                />
              </div>
              <div className="flex flex-1 w-full overflow-y-hidden">
                {showProjectSidebar && <Sidebar />}
                {studioLocked ? (
                  <div className="h-full flex-1 overflow-y-auto">{content}</div>
                ) : (
                  <ResizablePanelGroup
                    orientation="horizontal"
                    className="h-full w-full overflow-x-hidden flex-1 flex flex-row gap-0"
                    autoSaveId="default-layout-content"
                  >
                    <ResizablePanel
                      id="panel-content"
                      className="w-full"
                      minSize={`${contentMinSizePercentage}`}
                      maxSize={`${contentMaxSizePercentage}`}
                      defaultSize={`${contentMaxSizePercentage}`}
                    >
                      <div className="h-full overflow-y-auto">{content}</div>
                    </ResizablePanel>
                    <LayoutSidebar
                      minSize={`${100 - contentMaxSizePercentage}`}
                      maxSize={`${100 - contentMinSizePercentage}`}
                      defaultSize={`${100 - contentMaxSizePercentage}`}
                    />
                  </ResizablePanelGroup>
                )}
              </div>
            </div>

            <BannerStack />
          </BannerStackProvider>
        </ProjectContextProvider>
      </LayoutSidebarProvider>
    </SidebarProvider>
  )
}

export default DefaultLayout
