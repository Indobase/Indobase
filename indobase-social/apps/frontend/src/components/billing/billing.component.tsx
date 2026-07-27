'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { MainBillingComponent } from './main.billing.component';
import { useVariables } from '@gitroom/react/helpers/variable.context';

export const BillingComponent = () => {
  const fetch = useFetch();
  const { billingEnabled } = useVariables();
  const load = useCallback(async (path: string) => {
    const res = await fetch(path);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  }, []);

  const { isLoading: isLoadingTiers, data: tiers } = useSWR(
    billingEnabled ? '/user/subscription/tiers' : null,
    load
  );
  const { isLoading: isLoadingSubscription, data: subscription } = useSWR(
    billingEnabled ? '/user/subscription' : null,
    load
  );

  if (!billingEnabled) {
    return (
      <div className="p-8 text-sm opacity-80 max-w-lg">
        <h2 className="text-lg font-semibold mb-2">Billing</h2>
        <p>
          Indobase Social billing is managed through your Indobase Studio plan.
          Channel limits and Studio access follow your organization subscription —
          there is no separate Social checkout on this host.
        </p>
      </div>
    );
  }

  if (isLoadingSubscription || isLoadingTiers) {
    return <LoadingComponent />;
  }
  return <MainBillingComponent sub={subscription?.subscription} />;
};
