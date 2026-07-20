import { useLocation } from '@remix-run/react';
import { useEffect } from 'react';

import { capturePostHogPageview, initPostHog } from '~/lib/analytics/posthog.client';

export function PostHogAnalytics() {
  const location = useLocation();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    capturePostHogPageview(location.pathname);
  }, [location.pathname]);

  return null;
}
