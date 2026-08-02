import { productNameServerSide } from '@gitroom/helpers/utils/product-name';
import { Metadata } from 'next';
import { StudioSsoLanding } from '@gitroom/frontend/components/auth/studio-sso-landing';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${productNameServerSide()}`,
  description: '',
};

export default async function Welcome(params: {
  searchParams: Promise<{ project_ref?: string }>;
}) {
  const search = await params.searchParams;
  return <StudioSsoLanding projectRef={search?.project_ref} />;
}
