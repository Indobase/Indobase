import { useCustomContent } from 'hooks/custom-content/useCustomContent'
import { BASE_PATH } from 'lib/constants'
import { useTheme } from 'next-themes'
import Head from 'next/head'
import Image from 'next/legacy/image'
import type { PropsWithChildren } from 'react'
import { Separator } from 'ui'
import { withAuth } from '../../hooks/misc/withAuth'

export interface LinkAwsMarketplaceLayoutProps {}

const LinkAwsMarketplaceLayout = ({
  children,
}: PropsWithChildren<LinkAwsMarketplaceLayoutProps>) => {
  const { resolvedTheme } = useTheme()
  const { appTitle } = useCustomContent(['app:title'])

  return (
    <>
      <Head>
        <title>AWS Marketplace Setup | {appTitle || 'Indobase'}</title>
      </Head>
      <main className="flex flex-col flex-grow w-full h-full overflow-y-auto">
        <div>
          <div className="mx-auto px-4 sm:px-6">
            <div className="max-w-xl flex justify-between items-center py-4">
              <div className="flex justify-start lg:w-0 lg:flex-1">
                <div>
                  <span className="sr-only">Indobase</span>
                  <Image
                    src={`${BASE_PATH}/img/indobase-brand.png`}
                    alt="Indobase Logo"
                    height={28}
                    width={28}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col justify-center flex-grow mx-auto w-[90vw] space-y-4">
          {children}
        </div>
      </main>
    </>
  )
}

export default withAuth(LinkAwsMarketplaceLayout)
