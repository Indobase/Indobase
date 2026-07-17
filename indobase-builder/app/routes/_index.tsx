import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Chat } from '~/components/chat/Chat.client';
import { BuilderErrorBoundary } from '~/components/BuilderErrorBoundary';
import { Header } from '~/components/header/Header';
import { AtmosphereBackground } from '~/components/ui/AtmosphereBackground';

export const meta: MetaFunction = () => {
  return [
    { title: 'Indobase Builder' },
    { name: 'description', content: 'Build and deploy your frontend and full-stack applications using AI.' },
  ];
};

export const loader = () => json({});

/**
 * Landing page component for Indobase Builder
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="relative flex h-full w-full flex-col bg-[#E8F2FB]">
      <AtmosphereBackground />
      <div className="relative z-10 flex h-full w-full flex-col">
        <Header />
        <ClientOnly
          fallback={
            <div className="relative z-10 flex flex-1 items-center justify-center p-8 text-sm text-[#1E3A5F]/70">
              Loading Indobase Builder…
            </div>
          }
        >
          {() => (
            <BuilderErrorBoundary>
              <Chat />
            </BuilderErrorBoundary>
          )}
        </ClientOnly>
      </div>
    </div>
  );
}
