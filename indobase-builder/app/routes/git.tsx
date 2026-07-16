import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { GitUrlImport } from '~/components/git/GitUrlImport.client';
import { Header } from '~/components/header/Header';
import { AtmosphereBackground } from '~/components/ui/AtmosphereBackground';

export const meta: MetaFunction = () => {
  return [
    { title: 'Indobase Builder' },
    { name: 'description', content: 'Build and deploy your frontend and full-stack applications using AI.' },
  ];
};

export async function loader(args: LoaderFunctionArgs) {
  return json({ url: args.params.url });
}

export default function Index() {
  return (
    <div className="relative flex h-full w-full flex-col bg-[#E8F2FB]">
      <AtmosphereBackground />
      <div className="relative z-10 flex h-full w-full flex-col">
        <Header />
        <ClientOnly fallback={<BaseChat />}>{() => <GitUrlImport />}</ClientOnly>
      </div>
    </div>
  );
}
