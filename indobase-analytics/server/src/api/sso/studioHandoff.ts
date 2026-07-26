/**
 * Indobase Analytics — Studio SSO handoff.
 *
 * Studio mints HS256 JWT (aud=indobase-analytics) → GET /sso/launch#token=…
 * → POST /sso/session verifies, upserts Better Auth user/org/site, signs in,
 * redirects to /{siteId}.
 *
 * Public password signup stays disabled (DISABLE_SIGNUP=true). Login UI
 * redirects to Studio when STUDIO_PUBLIC_URL is set.
 */

import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../db/postgres/postgres.js";
import { account, member, organization, sites, user as userTable } from "../../db/postgres/schema.js";
import { auth } from "../../lib/auth.js";
import { siteConfigurationLifecycle } from "../../services/sites/siteConfigurationLifecycle.js";

const HANDOFF_AUD = "indobase-analytics";
const PROJECT_TAG_PREFIX = "ib-project:";

function handoffSecret(): string {
  const secret = (
    process.env.ANALYTICS_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    ""
  ).trim();
  if (secret.length < 32) {
    throw new Error("ANALYTICS_HANDOFF_SECRET / STUDIO_HANDOFF_SECRET must be >= 32 chars");
  }
  return secret;
}

function studioPublicUrl(): string {
  return (process.env.STUDIO_PUBLIC_URL || "https://studio.indobase.in").replace(/\/+$/, "");
}

function b64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(str: string) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function timingSafeEq(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export type AnalyticsHandoffClaims = {
  aud: string;
  email: string;
  exp: number;
  iat?: number;
  iss?: string;
  organization_name?: string;
  organization_slug: string;
  project_name?: string;
  project_ref: string;
  role: string;
  studio_url?: string;
  sub: string;
};

export function verifyHandoffToken(token: string): AnalyticsHandoffClaims | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac("sha256", handoffSecret()).update(`${h}.${p}`).digest());
  if (!timingSafeEq(expected, s)) return null;
  let payload: AnalyticsHandoffClaims;
  try {
    payload = JSON.parse(fromB64url(p).toString("utf8"));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== HANDOFF_AUD) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (!payload.sub || !payload.email || !payload.project_ref || !payload.organization_slug) return null;
  return payload;
}

/** Deterministic credential so SSO can mint a Better Auth session without a password UI. */
function deriveSsoPassword(email: string) {
  return crypto.createHmac("sha256", handoffSecret()).update(`ib-analytics-sso:${email.toLowerCase()}`).digest("hex");
}

function generateId(len = 32) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(len);
  let id = "";
  for (let i = 0; i < len; i++) id += alphabet[bytes[i]! % alphabet.length];
  return id;
}

function mapStudioRoleToOrgRole(role: string): "owner" | "admin" | "member" {
  if (role === "owner") return "owner";
  if (role === "admin" || role === "developer") return "admin";
  return "member";
}

function projectTag(projectRef: string) {
  return `${PROJECT_TAG_PREFIX}${projectRef}`;
}

function defaultSiteDomain(projectRef: string) {
  const suffix = (process.env.ANALYTICS_SITE_DOMAIN_SUFFIX || "indobase.in").replace(/^\./, "");
  return `${projectRef}.${suffix}`;
}

function launchHtml(studioUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Analytics</title>
  <style>
    :root { color-scheme: light dark; --blue:#3B8FD6; --gold:#C9A227; }
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: radial-gradient(ellipse 70% 50% at 50% -10%, rgba(59,143,214,.22), transparent 60%),
                  hsl(210 20% 98%); color: hsl(215 25% 15%); }
    .card { text-align:center; padding:2rem; max-width:22rem; }
    .mark { width:48px; height:48px; margin:0 auto 1rem; border-radius:12px;
      background: linear-gradient(135deg, var(--blue), #5AA0DE); }
    h1 { font-size:1.15rem; font-weight:600; margin:0 0 .35rem; }
    p { margin:0; color:hsl(215 12% 40%); font-size:.9rem; }
    a { color: var(--blue); }
    .err { color:#b91c1c; margin-top:1rem; font-size:.85rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark" aria-hidden="true"></div>
    <h1>Indobase Analytics</h1>
    <p id="status">Opening from Studio…</p>
    <p class="err" id="error" hidden></p>
  </div>
  <script>
    (function () {
      var studio = ${JSON.stringify(studioUrl)};
      var statusEl = document.getElementById('status');
      var errorEl = document.getElementById('error');
      function fail(msg) {
        statusEl.textContent = 'Could not open Analytics';
        errorEl.hidden = false;
        errorEl.innerHTML = msg + ' <a href=\"' + studio + '\">Back to Studio</a>';
      }
      var hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      var token = hash.get('token');
      if (!token) {
        fail('Missing handoff token.');
        return;
      }
      var qs = new URLSearchParams(location.search);
      fetch('/sso/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          token: token,
          project_ref: qs.get('project_ref') || undefined
        })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.redirect) {
            fail((res.j && res.j.message) || 'Invalid or expired session.');
            return;
          }
          location.replace(res.j.redirect);
        })
        .catch(function () { fail('Network error.'); });
    })();
  </script>
</body>
</html>`;
}

async function ensureUser(email: string, name: string) {
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  const password = deriveSsoPassword(email);

  if (existing?.user) {
    const accounts = await ctx.internalAdapter.findAccounts(existing.user.id);
    const hasCredential = accounts.some(a => a.providerId === "credential");
    const hashed = await ctx.password.hash(password);
    if (!hasCredential) {
      await ctx.internalAdapter.linkAccount({
        accountId: existing.user.id,
        providerId: "credential",
        password: hashed,
        userId: existing.user.id,
      });
    } else {
      // Keep SSO password in sync so sign-in always works.
      await db
        .update(account)
        .set({ password: hashed, updatedAt: new Date().toISOString() })
        .where(and(eq(account.userId, existing.user.id), eq(account.providerId, "credential")));
    }
    return existing.user;
  }

  const created = await ctx.internalAdapter.createUser({
    email,
    name: name || email,
    emailVerified: true,
  });
  if (!created) throw new Error("Failed to create analytics user");
  const hashed = await ctx.password.hash(password);
  await ctx.internalAdapter.linkAccount({
    accountId: created.id,
    providerId: "credential",
    password: hashed,
    userId: created.id,
  });
  return created;
}

async function ensureOrganization(slug: string, name: string, ownerUserId: string) {
  const existingRows = await db.select().from(organization).where(eq(organization.slug, slug)).limit(1);
  const existing = existingRows[0];
  if (existing) {
    const membershipRows = await db
      .select()
      .from(member)
      .where(and(eq(member.userId, ownerUserId), eq(member.organizationId, existing.id)))
      .limit(1);
    if (!membershipRows[0]) {
      await db.insert(member).values({
        id: generateId(),
        organizationId: existing.id,
        userId: ownerUserId,
        role: "owner",
        createdAt: new Date().toISOString(),
        hasRestrictedSiteAccess: false,
      });
    }
    return existing;
  }

  const orgId = generateId();
  const now = new Date().toISOString();
  await db.insert(organization).values({
    id: orgId,
    name: name || slug,
    slug,
    createdAt: now,
    metadata: JSON.stringify({ source: "indobase-studio" }),
  });
  await db.insert(member).values({
    id: generateId(),
    organizationId: orgId,
    userId: ownerUserId,
    role: "owner",
    createdAt: now,
    hasRestrictedSiteAccess: false,
  });
  const createdRows = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1);
  const created = createdRows[0];
  if (!created) throw new Error("Failed to create analytics organization");
  return created;
}

async function syncMembership(
  organizationId: string,
  userId: string,
  orgRole: "owner" | "admin" | "member"
) {
  const membershipRows = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  const membership = membershipRows[0];
  if (!membership) {
    await db.insert(member).values({
      id: generateId(),
      organizationId,
      userId,
      role: orgRole,
      createdAt: new Date().toISOString(),
      hasRestrictedSiteAccess: false,
    });
    return;
  }
  // Never demote an existing owner via SSO.
  if (membership.role === "owner") return;
  if (membership.role !== orgRole) {
    await db.update(member).set({ role: orgRole }).where(eq(member.id, membership.id));
  }
}

async function ensureSite(opts: {
  organizationId: string;
  createdBy: string;
  projectRef: string;
  projectName: string;
}) {
  const tag = projectTag(opts.projectRef);
  const tagged = await db
    .select()
    .from(sites)
    .where(
      and(
        eq(sites.organizationId, opts.organizationId),
        sql`${sites.tags} @> ${JSON.stringify([tag])}::jsonb`
      )
    )
    .limit(1);

  if (tagged[0]) return tagged[0];

  const domain = defaultSiteDomain(opts.projectRef);
  const byDomain = await db
    .select()
    .from(sites)
    .where(and(eq(sites.organizationId, opts.organizationId), eq(sites.domain, domain)))
    .limit(1);
  if (byDomain[0]) {
    const existingTags = Array.isArray(byDomain[0].tags) ? byDomain[0].tags : [];
    if (!existingTags.includes(tag)) {
      await db
        .update(sites)
        .set({ tags: [...existingTags, tag] })
        .where(eq(sites.siteId, byDomain[0].siteId));
    }
    return byDomain[0];
  }

  return siteConfigurationLifecycle.create({
    organizationId: opts.organizationId,
    createdBy: opts.createdBy,
    domain,
    name: opts.projectName || opts.projectRef,
    type: "web",
    tags: [tag],
  });
}

function applySetCookieHeaders(reply: FastifyReply, headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies =
    typeof getSetCookie === "function" ? getSetCookie.call(headers) : headers.get("set-cookie") ? [headers.get("set-cookie")!] : [];
  for (const cookie of cookies) {
    if (cookie) reply.header("Set-Cookie", cookie);
  }
}

export async function ssoRoutes(fastify: FastifyInstance) {
  fastify.get("/sso/health", async (_req, reply) => {
    return reply.send({
      ok: true,
      service: "indobase-analytics",
      product: "Indobase Analytics",
    });
  });

  fastify.get("/sso/launch", async (_req, reply) => {
    return reply.type("text/html").send(launchHtml(studioPublicUrl()));
  });

  fastify.post(
    "/sso/session",
    async (
      request: FastifyRequest<{
        Body: { token?: string; project_ref?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const token = request.body?.token;
        if (!token) return reply.status(400).send({ message: "Missing handoff token" });

        const claims = verifyHandoffToken(token);
        if (!claims) return reply.status(401).send({ message: "Invalid or expired handoff token" });

        const projectRef = (request.body?.project_ref || claims.project_ref).trim();
        if (!projectRef) return reply.status(400).send({ message: "project_ref is required" });

        const email = claims.email.trim().toLowerCase();
        const displayName = email.split("@")[0] || email;
        const orgRole = mapStudioRoleToOrgRole(claims.role);

        const authUser = await ensureUser(email, displayName);
        const org = await ensureOrganization(
          claims.organization_slug,
          claims.organization_name || claims.organization_slug,
          authUser.id
        );
        await syncMembership(org.id, authUser.id, orgRole);

        const site = await ensureSite({
          organizationId: org.id,
          createdBy: authUser.id,
          projectRef,
          projectName: claims.project_name || projectRef,
        });

        const password = deriveSsoPassword(email);
        const signInResponse = await auth.api.signInEmail({
          body: { email, password },
          asResponse: true,
        });

        if (!signInResponse.ok) {
          const errText = await signInResponse.text().catch(() => "");
          request.log.error({ status: signInResponse.status, errText }, "SSO sign-in failed");
          return reply.status(500).send({ message: "Failed to establish Analytics session" });
        }

        applySetCookieHeaders(reply, signInResponse.headers);

        // Pin active org for subsequent Better Auth org plugin calls.
        try {
          const sessionJson = (await signInResponse.clone().json()) as {
            session?: { token?: string };
            token?: string;
          };
          const sessionToken = sessionJson?.session?.token || sessionJson?.token;
          if (sessionToken) {
            await db.execute(
              sql`update session set active_organization_id = ${org.id} where token = ${sessionToken}`
            );
          }
        } catch (err) {
          request.log.warn({ err }, "Could not set active_organization_id on session");
        }

        // First Studio SSO user becomes platform admin (self-hosted bootstrap).
        try {
          const admins = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, "admin")).limit(1);
          if (admins.length === 0) {
            await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, authUser.id));
          }
        } catch {
          /* ignore */
        }

        return reply.send({
          ok: true,
          redirect: `/${site.siteId}`,
          site_id: site.siteId,
          domain: site.domain,
          project_ref: projectRef,
          organization_slug: claims.organization_slug,
          role: claims.role,
        });
      } catch (error) {
        request.log.error({ err: error }, "SSO session error");
        const message = error instanceof Error ? error.message : "SSO failed";
        const status = message.includes("secret") ? 503 : 500;
        return reply.status(status).send({ message });
      }
    }
  );
}
