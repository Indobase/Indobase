import { productNameServerSide } from '@gitroom/helpers/utils/product-name';
import { Metadata } from 'next';
import { StudioSsoLanding } from '@gitroom/frontend/components/auth/studio-sso-landing';
import { Register } from '@gitroom/frontend/components/auth/register';
import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import Link from 'next/link';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { LoginWithOidc } from '@gitroom/frontend/components/auth/login.with.oidc';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${productNameServerSide()}`,
  description: '',
};

function studioHandoffOnly() {
  return (
    process.env.STUDIO_HANDOFF_ONLY === 'true' ||
    process.env.STUDIO_HANDOFF_ONLY === '1'
  );
}

export default async function Auth(params: {
  searchParams: Promise<{ provider?: string; project_ref?: string }>;
}) {
  const search = await params.searchParams;
  if (studioHandoffOnly()) {
    return <StudioSsoLanding projectRef={search?.project_ref} />;
  }

  const t = await getT();
  if (process.env.DISABLE_REGISTRATION === 'true') {
    const canRegister = (
      await (await internalFetch('/auth/can-register')).json()
    ).register;
    if (!canRegister && !search?.provider) {
      return (
        <>
          <LoginWithOidc />
          <div className="text-center">
            {t('registration_is_disabled', 'Registration is disabled')}
            <br />
            <Link className="underline hover:font-bold" href="/auth/login">
              {t('login_instead', 'Login instead')}
            </Link>
          </div>
        </>
      );
    }
  }
  return <Register />;
}
