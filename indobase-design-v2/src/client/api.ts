export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  if (body) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const data = (await r.json().catch(() => ({}))) as {
    error?: string
    signInUrl?: string
  }
  if (r.status === 401) {
    // Studio SSO only — no public login on Design. Send unauthenticated visitors to Studio.
    const signIn =
      (typeof data.signInUrl === 'string' && data.signInUrl) ||
      'https://studio.indobase.fun/sign-in'
    location.replace(signIn)
    throw new Error('unauthorized')
  }
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
