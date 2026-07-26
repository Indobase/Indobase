export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { PlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/platform.analytics';
import { productNameServerSide } from '@gitroom/helpers/utils/product-name';
export const metadata: Metadata = {
  title: `${productNameServerSide()} Analytics`,
  description: '',
};
export default async function Index() {
  return <PlatformAnalytics />;
}
