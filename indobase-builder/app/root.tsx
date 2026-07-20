import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore, DEFAULT_THEME } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';
import { cssTransition, ToastContainer } from 'react-toastify';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    if (!theme) {
      theme = 'light';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

import { logStore } from './lib/stores/logs';
import { hydrateClientPrefsFromStorage } from './lib/stores/hydrateClientPrefs';
import { restoreBuilderSessionOnLoad, startBuilderSessionKeeper } from './lib/indobase/builder-auth.client';
import { warmWebContainer } from './lib/webcontainer';
import { WebContainerBootBanner } from './components/WebContainerBootBanner.client';
import { PostHogAnalytics } from './components/analytics/PostHogAnalytics.client';

export default function App() {
  useEffect(() => {
    hydrateClientPrefsFromStorage();

    logStore.logSystem('Application initialized', {
      theme: themeStore.get(),
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    // Initialize debug logging with improved error handling
    import('./utils/debugLogger')
      .then(({ debugLogger }) => {
        /*
         * The debug logger initializes itself and starts disabled by default
         * It will only start capturing when enableDebugMode() is called
         */
        const status = debugLogger.getStatus();
        logStore.logSystem('Debug logging ready', {
          initialized: status.initialized,
          capturing: status.capturing,
          enabled: status.enabled,
        });
      })
      .catch((error) => {
        logStore.logError('Failed to initialize debug logging', error);
      });

    const startWorkspace = () => warmWebContainer();
    const idleId =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(startWorkspace, { timeout: 2500 })
        : undefined;
    const timerId = idleId === undefined ? window.setTimeout(startWorkspace, 800) : undefined;

    void (async () => {
      await restoreBuilderSessionOnLoad();
      const { getStoredIndobaseConnection } = await import('~/lib/indobase/mcp');
      const { hasIndobaseStudioHandoff } = await import('~/lib/indobase/connection');

      if (hasIndobaseStudioHandoff(getStoredIndobaseConnection())) {
        const { useMCPStore } = await import('~/lib/stores/mcp');
        await useMCPStore.getState().initialize();
        await useMCPStore.getState().syncWithIndobaseConnection();
      }
    })();

    const stopSessionKeeper = startBuilderSessionKeeper();

    return () => {
      stopSessionKeeper();
      if (idleId !== undefined) {
        cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  return <Outlet />;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <html lang="en" suppressHydrationWarning data-theme={DEFAULT_THEME}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
      </head>
      <body suppressHydrationWarning>
        <ClientOnly fallback={null}>{() => <PostHogAnalytics />}</ClientOnly>
        <ClientOnly fallback={null}>{() => <WebContainerBootBanner />}</ClientOnly>
        <ClientOnly fallback={<>{children}</>}>
          {() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}
        </ClientOnly>
        <ToastContainer
          closeButton={({ closeToast }) => {
            return (
              <button className="Toastify__close-button" onClick={closeToast}>
                <div className="i-ph:x text-lg" />
              </button>
            );
          }}
          icon={({ type }) => {
            switch (type) {
              case 'success': {
                return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
              }
              case 'error': {
                return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
              }
            }

            return undefined;
          }}
          position="bottom-right"
          pauseOnFocusLoss
          transition={toastAnimation}
          autoClose={3000}
        />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
