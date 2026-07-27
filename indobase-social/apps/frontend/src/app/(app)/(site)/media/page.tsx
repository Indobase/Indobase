import { MediaLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.media.component';
import { Metadata } from 'next';
import { productNameServerSide } from '@gitroom/helpers/utils/product-name';

export const metadata: Metadata = {
  title: `${productNameServerSide()} Media`,
  description: '',
};

export default async function Page() {
  return <MediaLayoutComponent />
}
