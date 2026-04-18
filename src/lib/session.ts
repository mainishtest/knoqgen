import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb, type Env } from "./db";
import { sha256Hex, randomToken } from "./password";
import type { LayoutCtx } from "./html";
import { getSubdomain } from "./subdomain";

export const SESSION_COOKIE = "knoqgen_sess";
const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  is_super_admin: boolean;
};

export type SessionOrg = {
  id: string;
  slug: string;
  display_name: string;
  reply_to_email: string;
  notify_email: string;
  status: string;
  sending_mode: "shared" | "custom";
  custom_sending_domain: string | null;
  custom_sending_verified: boolean;
  custom_landing_domain: string | null;
  custom_landing_verified: boolean;
  plan: string | null;
  billing_status: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export type Membership = {
  organization_id: string;
  role: "owner" | "rep";
  slug: string;
  display_name: string;
};

export type Ctx = {
  Bindings: Env;
  Variables: {
    user: SessionUser;
    org: SessionOrg;
    memberships: Membership[];
    sessionId: string;
  };
};

export async function createSession(env: Env, userId: string, activeOrgId: string | null, req: { ip?: string; ua?: string }): Promise<string> {
  const sql = getDb(env);
  const raw = randomToken(32);
  const hash = await sha256Hex(raw);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  await sql`
    INSERT INTO sessions (user_id, token_hash, active_org_id, ip, user_agent, expires_at)
    VALUES (${userId}, ${hash}, ${activeOrgId}, ${req.ip || null}, ${req.ua || null}, ${expires})
  `;
  return raw;
}

export async function destroySession(env: Env, rawToken: string) {
  const sql = getDb(env);
  const hash = await sha256Hex(rawToken);
  await sql`DELETE FROM sessions WHERE token_hash = ${hash}`;
}

export async function setActiveOrg(env: Env, rawToken: string, orgId: string) {
  const sql = getDb(env);
  const hash = await sha256Hex(rawToken);
  await sql`UPDATE sessions SET active_org_id = ${orgId} WHERE token_hash = ${hash}`;
}

function setSessionCookie(c: Context, token: string, domain?: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_DAYS * 24 * 3600,
    path: "/",
    ...(domain ? { domain } : {}),
  });
}

export function clearSessionCookie(c: Context, domain?: string) {
  deleteCookie(c, SESSION_COOKIE, {
    path: "/",
    ...(domain ? { domain } : {}),
  });
}

export { setSessionCookie };

// Resolve the current user + org + memberships. Returns null if not authed.
// Pass subdomainSlug to force the active org to match a subdomain (multi-tenant routing).
export async function resolveSession(c: Context<any>, subdomainSlug?: string): Promise<{
  user: SessionUser;
  org: SessionOrg | null;
  memberships: Membership[];
  sessionId: string;
  rawToken: string;
} | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const sql = getDb(c.env);
  const hash = await sha256Hex(raw);
  const rows = await sql`
    SELECT s.id as session_id, s.active_org_id,
           u.id as user_id, u.email, u.name, u.is_super_admin
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ${hash} AND s.expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) return null;
  const r: any = rows[0];
  const user: SessionUser = {
    id: r.user_id,
    email: r.email,
    name: r.name,
    is_super_admin: !!r.is_super_admin,
  };
  // Memberships
  const memRows = await sql`
    SELECT m.organization_id, m.role, o.slug, o.display_name
    FROM memberships m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.user_id = ${user.id} AND m.is_active = true AND m.accepted_at IS NOT NULL
    ORDER BY o.display_name
  `;
  const memberships: Membership[] = memRows.map((m: any) => ({
    organization_id: m.organization_id,
    role: m.role,
    slug: m.slug,
    display_name: m.display_name,
  }));

  let activeOrgId: string | null = r.active_org_id;

  // ── Subdomain override ──
  // If the request came in on [slug].knoqgen.com, force the active org
  // to match that slug. If the user doesn't have access and isn't a super admin,
  // return null so they get redirected to login.
  if (subdomainSlug) {
    const subMem = memberships.find(m => m.slug === subdomainSlug);
    if (subMem) {
      activeOrgId = subMem.organization_id;
      if (activeOrgId !== r.active_org_id) {
        await sql`UPDATE sessions SET active_org_id = ${activeOrgId} WHERE id = ${r.session_id}`;
      }
    } else if (!user.is_super_admin) {
      // No membership for this org — deny
      return null;
    }
    // Super admins can access any subdomain without a membership
  } else if (!activeOrgId && memberships.length) {
    activeOrgId = memberships[0].organization_id;
    await sql`UPDATE sessions SET active_org_id = ${activeOrgId} WHERE id = ${r.session_id}`;
  } else if (activeOrgId && !memberships.find(m => m.organization_id === activeOrgId)) {
    // Active org no longer valid — fall back to first membership
    activeOrgId = memberships.length ? memberships[0].organization_id : null;
    if (activeOrgId) {
      await sql`UPDATE sessions SET active_org_id = ${activeOrgId} WHERE id = ${r.session_id}`;
    }
  }

  let org: SessionOrg | null = null;
  if (activeOrgId) {
    const orgRows = await sql`
      SELECT id, slug, display_name, reply_to_email, notify_email, status,
             sending_mode, custom_sending_domain, custom_sending_verified,
             custom_landing_domain, custom_landing_verified,
             plan, billing_status, trial_ends_at,
             stripe_customer_id, stripe_subscription_id
      FROM organizations WHERE id = ${activeOrgId} LIMIT 1
    `;
    if (orgRows.length) org = orgRows[0] as SessionOrg;
  }

  return { user, org, memberships, sessionId: r.session_id, rawToken: raw };
}

// Build a LayoutCtx from a Hono context that has been through requireAuth/requireOwner/requireSuperAdmin.
export function layoutCtx(c: Context<Ctx>): LayoutCtx {
  const user = c.get("user");
  const org = c.get("org");
  const memberships = c.get("memberships") || [];
  const active = memberships.find(m => m.organization_id === org?.id);
  return {
    orgName: org?.display_name,
    orgSlug: org?.slug,
    memberships: memberships.map(m => ({
      organization_id: m.organization_id,
      slug: m.slug,
      display_name: m.display_name,
      role: m.role,
    })),
    activeOrgId: org?.id,
    userEmail: user?.email,
    isSuperAdmin: !!user?.is_super_admin,
    isOwner: active?.role === "owner",
  };
}

// Middleware: require authenticated user (redirects to /login)
export async function requireAuth(c: Context<Ctx>, next: Next) {
  const subdomain = getSubdomain(c.req.header("host") || "");
  const s = await resolveSession(c, subdomain || undefined);
  if (!s) return c.redirect("/login");
  if (!s.org) return c.redirect("/onboarding/new-org");
  c.set("user", s.user);
  c.set("org", s.org);
  c.set("memberships", s.memberships);
  c.set("sessionId", s.sessionId);
  return next();
}

// Middleware: require super-admin
export async function requireSuperAdmin(c: Context<Ctx>, next: Next) {
  const subdomain = getSubdomain(c.req.header("host") || "");
  const s = await resolveSession(c, subdomain || undefined);
  if (!s || !s.user.is_super_admin) return c.redirect("/login");
  c.set("user", s.user);
  if (s.org) c.set("org", s.org);
  c.set("memberships", s.memberships);
  c.set("sessionId", s.sessionId);
  return next();
}

// Middleware: require owner role in current org
export async function requireOwner(c: Context<Ctx>, next: Next) {
  const subdomain = getSubdomain(c.req.header("host") || "");
  const s = await resolveSession(c, subdomain || undefined);
  if (!s) return c.redirect("/login");
  if (!s.org) return c.redirect("/onboarding/new-org");
  const mem = s.memberships.find(m => m.organization_id === s.org!.id);
  if (!mem || mem.role !== "owner") {
    if (!s.user.is_super_admin) {
      return c.text("Forbidden", 403);
    }
  }
  c.set("user", s.user);
  c.set("org", s.org);
  c.set("memberships", s.memberships);
  c.set("sessionId", s.sessionId);
  return next();
}
