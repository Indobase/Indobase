export const dynamic = 'force-dynamic';
import { LaunchesComponent } from '@gitroom/frontend/components/launches/launches.component';
import { Metadata } from 'next';
import { productNameServerSide } from '@gitroom/helpers/utils/product-name';
export const metadata: Metadata = {
  title: `${productNameServerSide()} Calendar`,
  description: '',
};
export default async function Index() {
  return <LaunchesComponent />;
}
