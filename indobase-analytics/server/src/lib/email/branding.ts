const DEFAULT_ANALYTICS_ORIGIN = "https://analytics.indobase.in";
const DOCS_URL = "https://github.com/Indobase/Indobase/blob/main/docs/INDOBASE-ANALYTICS.md";

export function getEmailAppOrigin(): string {
  return (process.env.BASE_URL || DEFAULT_ANALYTICS_ORIGIN).replace(/\/$/, "");
}

export function getEmailLogoUrl(): string {
  return `${getEmailAppOrigin()}/indobase/wordmark.svg`;
}

export function getEmailDocsUrl(): string {
  return DOCS_URL;
}

export function getEmailAppPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getEmailAppOrigin()}${normalized}`;
}
