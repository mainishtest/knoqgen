// Email sending helpers for Resend.
// Option C: orgs send from shared `leads.knoqgen.com` by default.
// Paid orgs with a verified custom domain send from that domain.

import type { Env } from "./db";

const SHARED_SENDING_DOMAIN = "leads.knoqgen.com";
const PLATFORM_SENDING_DOMAIN = "leads.knoqgen.com"; // for platform→user emails (trial onboarding)

export type OrgForEmail = {
  slug: string;
  display_name: string;
  reply_to_email: string;
  sending_mode: "shared" | "custom";
  custom_sending_domain: string | null;
  custom_sending_verified: boolean;
};

export function buildFrom(org: OrgForEmail): string {
  if (org.sending_mode === "custom" && org.custom_sending_verified && org.custom_sending_domain) {
    return `${org.display_name} <hello@${org.custom_sending_domain}>`;
  }
  return `${org.display_name} <${org.slug}@${SHARED_SENDING_DOMAIN}>`;
}

export type ResendResult = {
  ok: boolean;
  status: number;
  body: string;
  id?: string;
};

export async function sendResend(
  env: Env,
  opts: { from: string; to: string[]; subject: string; html: string; reply_to?: string },
): Promise<ResendResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, status: 0, body: "RESEND_API_KEY not configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.reply_to ? { reply_to: opts.reply_to } : {}),
    }),
  });
  const text = await res.text();
  let id: string | undefined;
  try {
    const j = JSON.parse(text);
    if (j && typeof j.id === "string") id = j.id;
  } catch {}
  return { ok: res.ok, status: res.status, body: text, id };
}

// Tenant-scoped send (lead notifications, etc.)
export async function sendOrgEmail(
  env: Env,
  org: OrgForEmail,
  opts: { to: string[]; subject: string; html: string; replyTo?: string },
): Promise<ResendResult> {
  return sendResend(env, {
    from: buildFrom(org),
    reply_to: opts.replyTo ?? org.reply_to_email,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}

// ── Resend domain management (custom sending domain per org) ──
// Docs: https://resend.com/docs/api-reference/domains

export type ResendDomainRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string | number;
  priority?: number;
  status?: string;
};

export type ResendDomain = {
  id: string;
  name: string;
  status: string; // pending, verified, failed, etc.
  records?: ResendDomainRecord[];
  region?: string;
  created_at?: string;
};

async function resendDomainsFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.resend.com/domains${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function resendCreateDomain(env: Env, name: string): Promise<ResendDomain> {
  const res = await resendDomainsFetch(env, "", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend create domain failed (${res.status}): ${body}`);
  return JSON.parse(body) as ResendDomain;
}

export async function resendGetDomain(env: Env, id: string): Promise<ResendDomain> {
  const res = await resendDomainsFetch(env, `/${id}`);
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend get domain failed (${res.status}): ${body}`);
  return JSON.parse(body) as ResendDomain;
}

export async function resendVerifyDomain(env: Env, id: string): Promise<ResendDomain> {
  const res = await resendDomainsFetch(env, `/${id}/verify`, { method: "POST" });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend verify failed (${res.status}): ${body}`);
  return JSON.parse(body) as ResendDomain;
}

export async function resendDeleteDomain(env: Env, id: string): Promise<void> {
  const res = await resendDomainsFetch(env, `/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Resend delete failed (${res.status}): ${body}`);
  }
}

// Platform-scoped send (welcome emails to trial signups, system notices)
export async function sendPlatformEmail(
  env: Env,
  opts: { to: string[]; subject: string; html: string; replyTo?: string },
): Promise<ResendResult> {
  return sendResend(env, {
    from: `KnoqGen <hello@${PLATFORM_SENDING_DOMAIN}>`,
    reply_to: opts.replyTo ?? "hello@knoqgen.com",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
