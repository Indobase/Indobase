import { BASE_PATH } from 'lib/constants'
import {
  resolvePublicGotrueUrlForBrowser,
  resolveServerPublicAnonKey,
  resolveServerPublicBuilderAppUrl,
  resolveServerPublicSiteUrl,
} from 'common/public-env'
import Document, { DocumentContext, Head, Html, Main, NextScript } from 'next/document'

type RuntimePublicEnv = {
  anonKey?: string
  gotrueUrl?: string
  siteUrl?: string
  builderAppUrl?: string
  hcaptchaSiteKey?: string
}

function readRuntimePublicEnv(): RuntimePublicEnv {
  const anonKey = resolveServerPublicAnonKey()
  const gotrueUrl = resolvePublicGotrueUrlForBrowser() ?? ''
  const siteUrl = resolveServerPublicSiteUrl() ?? ''
  const builderAppUrl = resolveServerPublicBuilderAppUrl() ?? ''
  const hcaptchaSiteKey =
    process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() ||
    process.env.HCAPTCHA_SITE_KEY?.trim() ||
    ''

  return {
    ...(anonKey ? { anonKey } : {}),
    ...(gotrueUrl ? { gotrueUrl } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    ...(builderAppUrl ? { builderAppUrl } : {}),
    ...(hcaptchaSiteKey ? { hcaptchaSiteKey } : {}),
  }
}

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)

    return {
      ...initialProps,
      runtimePublicEnv: readRuntimePublicEnv(),
    }
  }

  render() {
    const runtimePublicEnv =
      (this.props as typeof this.props & { runtimePublicEnv?: RuntimePublicEnv })
        .runtimePublicEnv ?? {}

    const runtimePublicEnvScript =
      Object.keys(runtimePublicEnv).length > 0
        ? `window.__INDOBASE_PUBLIC_ENV__=${JSON.stringify(runtimePublicEnv)};`
        : null

    // Split-deploy images bake demo anon / prod SITE_URL at build time. Sync-fetch
    // runtime config before auth-js initializes when SSR omitted critical keys.
    const runtimeAnonKeyBootstrapScript =
      !runtimePublicEnv.anonKey || !runtimePublicEnv.siteUrl
        ? `(function(){try{var x=new XMLHttpRequest();x.open('GET','${BASE_PATH}/api/platform/runtime-public-env',false);x.withCredentials=true;x.send();if(x.status===200){var j=JSON.parse(x.responseText);window.__INDOBASE_PUBLIC_ENV__=Object.assign(window.__INDOBASE_PUBLIC_ENV__||{},j);}}catch(e){}})();`
        : null

    return (
      <Html lang="en">
        <Head>
          {runtimePublicEnvScript ? (
            <script dangerouslySetInnerHTML={{ __html: runtimePublicEnvScript }} />
          ) : null}
          {runtimeAnonKeyBootstrapScript ? (
            <script dangerouslySetInnerHTML={{ __html: runtimeAnonKeyBootstrapScript }} />
          ) : null}
          <link rel="icon" type="image/svg+xml" href={`${BASE_PATH}/favicon-indobase.svg`} />
          <link rel="apple-touch-icon" href={`${BASE_PATH}/indobase-logo-full.png`} />
          <meta name="description" content="Indobase Studio is the control plane for Indobase – manage projects, databases, storage, and infrastructure from a single dashboard." />
          <meta property="og:site_name" content="Indobase Studio" />
          <meta property="og:title" content="Indobase Studio – Project Dashboard" />
          <meta property="og:description" content="Operate your Indobase projects, inspect databases, manage auth, and monitor infrastructure in one place." />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="https://indobase.in/assets/og/indobase-studio.png" />
          <meta property="twitter:card" content="summary_large_image" />
          <meta property="twitter:title" content="Indobase Studio – Project Dashboard" />
          <meta property="twitter:description" content="Operate your Indobase projects, inspect databases, manage auth, and monitor infrastructure in one place." />
          <meta property="twitter:image" content="https://indobase.in/assets/og/indobase-studio.png" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
