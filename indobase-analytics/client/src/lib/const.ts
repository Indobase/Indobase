export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL === "http://localhost:3001"
    ? "http://localhost:3001/api"
    : `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`;
export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export const IS_CLOUD = process.env.NEXT_PUBLIC_CLOUD === "true";
export const DEPLOYMENT = process.env.NEXT_PUBLIC_DEPLOYMENT;
export const LITE_DASHBOARD = process.env.NEXT_PUBLIC_LITE_DASHBOARD === "true";

// Time constants
export const MINUTES_IN_24_HOURS = 24 * 60; // 1440 minutes

/** Managed Indobase demo host (unused in SSO-gated production). */
export const DEMO_HOSTNAME = "analytics.indobase.in";

/** Product docs (monorepo handbook). Replaces upstream docs links. */
export const INDOBASE_ANALYTICS_DOCS_URL =
  "https://github.com/Indobase/Indobase/blob/main/docs/INDOBASE-ANALYTICS.md";
export const INDOBASE_HOME_URL = "https://indobase.in";
export const INDOBASE_PRIVACY_URL = "https://indobase.in/privacy";
export const INDOBASE_TERMS_URL = "https://indobase.in/terms";
export const INDOBASE_SUPPORT_EMAIL = "mailto:support@indobase.in";
export const INDOBASE_SOURCE_URL = "https://github.com/Indobase/Indobase/tree/main/indobase-analytics";

export const FREE_SITE_LIMIT = 1;
export const STANDARD_SITE_LIMIT = 5;
export const STANDARD_TEAM_LIMIT = 3;
export const BASIC_SITE_LIMIT = 1;
export const BASIC_TEAM_LIMIT = 1;