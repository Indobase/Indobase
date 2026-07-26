export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Activate } from '@gitroom/frontend/components/auth/activate';
import { productNameServerSide } from '@gitroom/helpers/utils/product-name';
export const metadata: Metadata = {
  title: `${
    productNameServerSide()
  } - Activate your account`,
  description: '',
};
export default async function Auth() {
  return <Activate />;
}
