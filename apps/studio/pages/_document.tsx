import { BASE_PATH } from 'lib/constants'
import Document, { DocumentContext, Head, Html, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)

    return initialProps
  }

  render() {
    return (
      <Html lang="en">
        <Head>
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
          {/* Workaround for https://github.com/suren-atoyan/monaco-react/issues/272 */}
          <link
            rel="stylesheet"
            type="text/css"
            data-name="vs/editor/editor.main"
            href={`${BASE_PATH}/monaco-editor/editor/editor.main.css`}
          />
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
