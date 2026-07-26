export function useAppEnv() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (hostname === "analytics.indobase.fun" || hostname === "demo.rybbit.com") {
    return "demo";
  }
  if (hostname === "analytics.indobase.in" || hostname === "app.rybbit.io") {
    return "prod";
  }

  return null;
}
