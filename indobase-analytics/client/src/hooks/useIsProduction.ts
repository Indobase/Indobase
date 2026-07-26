export function useAppEnv() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (hostname === "analytics.indobase.fun") {
    return "demo";
  }
  if (hostname === "analytics.indobase.in") {
    return "prod";
  }

  return null;
}
