import { Hono } from "hono";
import { getDb, type Env } from "../lib/db";
import { adminLayout, esc } from "../lib/html";
import { hashPassword, verifyPassword, randomToken } from "../lib/password";
import {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  resolveSession,
  setActiveOrg,
  SESSION_COOKIE,
} from "../lib/session";
import { sendPlatformEmail, sendOrgEmail } from "../lib/email";
import { getCookie } from "hono/cookie";
import { cookieDomain, orgBaseUrl } from "../lib/subdomain";

const auth = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
function slugify(s: string, suffix?: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "org";
  return suffix ? `${base}-${suffix}` : base;
}

async function uniqueOrgSlug(env: Env, name: string): Promise<string> {
  const sql = getDb(env);
  let slug = slugify(name);
  for (let i = 0; i < 5; i++) {
    const rows = await sql`SELECT 1 FROM organizations WHERE slug = ${slug} LIMIT 1`;
    if (!rows.length) return slug;
    slug = slugify(name, randomToken(2));
  }
  return slugify(name, randomToken(4));
}

function formCard(title: string, body: string, error?: string, note?: string): string {
  return adminLayout(title, `
    <div class="login-wrap">
      <h1>${esc(title)}</h1>
      ${note ? `<p class="text-muted">${note}</p>` : ""}
      ${error ? `<p style="color:#c62828;font-weight:600;margin:12px 0">${esc(error)}</p>` : ""}
      ${body}
    </div>
  `, false);
}

// ──────────────────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────────────────
auth.get("/login", async (c) => {
  // If already authed, bounce to dashboard
  const s = await resolveSession(c);
  if (s?.user) return c.redirect(s.org ? "/rep" : "/onboarding/new-org");

  return c.html(formCard("Sign In", `
    <form method="POST" action="/login">
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" required autofocus>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" required>
      </div>
      <button type="submit" class="btn" style="width:100%">Sign In</button>
    </form>
    <p style="margin-top:16px;font-size:14px;text-align:center">
      <a href="/signup">Start a free trial</a> &middot;
      <a href="/forgot">Forgot password?</a>
    </p>
  `));
});

auth.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const sql = getDb(c.env);

  const rows = await sql`SELECT id, password_hash FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  const user = rows[0] as { id: string; password_hash: string | null } | undefined;
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return c.html(formCard("Sign In", `
      <form method="POST" action="/login">
        <div class="form-group"><label>Email</label><input type="email" name="email" value="${esc(email)}" required></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" required autofocus></div>
        <button type="submit" class="btn" style="width:100%">Sign In</button>
      </form>
    `, "Incorrect email or password."), 401);
  }

  // Find first active membership to set as active_org
  const memRows = await sql`
    SELECT m.organization_id, o.slug FROM memberships m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.user_id = ${user.id} AND m.is_active = true AND m.accepted_at IS NOT NULL
    ORDER BY m.created_at LIMIT 1
  `;
  const activeOrgId = memRows[0]?.organization_id || null;
  const orgSlug = memRows[0]?.slug || null;

  const token = await createSession(c.env, user.id, activeOrgId, {
    ip: c.req.header("cf-connecting-ip"),
    ua: c.req.header("user-agent"),
  });
  const domain = cookieDomain(c.env.SITE_URL);
  setSessionCookie(c, token, domain);
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`;

  if (!activeOrgId || !orgSlug) return c.redirect("/onboarding/new-org");
  // Redirect to org's subdomain so they land at johnnymowing.knoqgen.com/rep
  return c.redirect(`${orgBaseUrl(orgSlug, c.env.SITE_URL)}/rep`);
});

auth.get("/logout", async (c) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) await destroySession(c.env, raw).catch(() => {});
  clearSessionCookie(c, cookieDomain(c.env.SITE_URL));
  return c.redirect("/login");
});
auth.post("/logout", async (c) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) await destroySession(c.env, raw).catch(() => {});
  clearSessionCookie(c, cookieDomain(c.env.SITE_URL));
  return c.redirect("/login");
});

// ──────────────────────────────────────────────────────────
// Bootstrap: one-time password setup for seeded users (no password_hash)
// Gated by ADMIN_PASSWORD so only the deployer can use it.
// Remove this route once all seeded accounts have passwords.
// ──────────────────────────────────────────────────────────
auth.get("/bootstrap", (c) => {
  return c.html(formCard("Set Your Password", `
    <form method="POST" action="/bootstrap">
      <div class="form-group"><label>Email</label><input type="email" name="email" required autofocus placeholder="david@mainish.com"></div>
      <div class="form-group"><label>Admin Secret</label><input type="password" name="admin_secret" required placeholder="Your ADMIN_PASSWORD from wrangler"></div>
      <div class="form-group"><label>New Password</label><input type="password" name="password" minlength="8" required placeholder="Choose a strong password"></div>
      <button type="submit" class="btn" style="width:100%">Set Password</button>
    </form>
    <p style="margin-top:16px;font-size:14px;text-align:center"><a href="/login">Back to sign in</a></p>
  `, undefined, "One-time setup for accounts created by migration."));
});

auth.post("/bootstrap", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || "").trim().toLowerCase();
  const adminSecret = String(body.admin_secret || "");
  const password = String(body.password || "");

  if (adminSecret !== c.env.ADMIN_PASSWORD) {
    return c.html(formCard("Set Your Password", `
      <form method="POST" action="/bootstrap">
        <div class="form-group"><label>Email</label><input type="email" name="email" value="${esc(email)}" required></div>
        <div class="form-group"><label>Admin Secret</label><input type="password" name="admin_secret" required autofocus></div>
        <div class="form-group"><label>New Password</label><input type="password" name="password" minlength="8" required></div>
        <button type="submit" class="btn" style="width:100%">Set Password</button>
      </form>
    `, "Wrong admin secret."), 401);
  }

  if (password.length < 8) {
    return c.html(formCard("Set Your Password", `
      <form method="POST" action="/bootstrap">
        <div class="form-group"><label>Email</label><input type="email" name="email" value="${esc(email)}" required></div>
        <div class="form-group"><label>Admin Secret</label><input type="password" name="admin_secret" required></div>
        <div class="form-group"><label>New Password</label><input type="password" name="password" minlength="8" required autofocus></div>
        <button type="submit" class="btn" style="width:100%">Set Password</button>
      </form>
    `, "Password must be at least 8 characters."), 400);
  }

  const sql = getDb(c.env);
  const rows = await sql`SELECT id, password_hash FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  const user = rows[0] as { id: string; password_hash: string | null } | undefined;

  if (!user) {
    return c.html(formCard("Set Your Password", `
      <form method="POST" action="/bootstrap">
        <div class="form-group"><label>Email</label><input type="email" name="email" required autofocus></div>
        <div class="form-group"><label>Admin Secret</label><input type="password" name="admin_secret" required></div>
        <div class="form-group"><label>New Password</label><input type="password" name="password" minlength="8" required></div>
        <button type="submit" class="btn" style="width:100%">Set Password</button>
      </form>
    `, "No user found with that email."), 404);
  }

  if (user.password_hash) {
    return c.html(formCard("Already Set", `
      <p>This account already has a password. <a href="/login">Sign in</a> or <a href="/forgot">reset your password</a>.</p>
    `));
  }

  const hash = await hashPassword(password);
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${user.id}`;

  return c.html(formCard("Password Set!", `
    <p style="color:#2e7d32;font-weight:600;margin-bottom:16px">Your password has been saved.</p>
    <a href="/login" class="btn" style="display:block;text-align:center;width:100%">Sign In Now</a>
  `));
});

// ──────────────────────────────────────────────────────────
// Self-service signup (creates user + organization + owner membership)
// ──────────────────────────────────────────────────────────
auth.get("/signup", (c) => {
  return c.html(formCard("Create Your Account", `
    <form method="POST" action="/signup">
      <div class="form-group"><label>Company Name</label><input type="text" name="company" required autofocus placeholder="e.g. Acme Painting"></div>
      <div class="form-group"><label>Your Name</label><input type="text" name="name" required></div>
      <div class="form-group"><label>Work Email</label><input type="email" name="email" required></div>
      <div class="form-group"><label>Phone</label><input type="tel" name="phone" placeholder="(208) 555-1234"></div>
      <div class="form-group"><label>Choose a Password</label><input type="password" name="password" minlength="8" required></div>
      <button type="submit" class="btn" style="width:100%">Start Free Trial</button>
      <p class="text-muted" style="margin-top:10px;text-align:center;font-size:13px">14-day free trial &middot; no credit card required</p>
    </form>
    <p style="margin-top:16px;font-size:14px;text-align:center">
      Already have an account? <a href="/login">Sign in</a>
    </p>
  `));
});

auth.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const company = String(body.company || "").trim();
  const phone = String(body.phone || "").trim() || null;

  if (!email || !password || !name || !company || password.length < 8) {
    return c.html(formCard("Create Your Account", `<p><a href="/signup">Back</a></p>`,
      "All fields required; password must be 8+ chars."), 400);
  }

  const sql = getDb(c.env);

  // Check existing user
  const existing = await sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  if (existing.length) {
    return c.html(formCard("Create Your Account", `<p><a href="/login">Sign in instead</a></p>`,
      "An account with that email already exists."), 400);
  }

  const pwHash = await hashPassword(password);
  const slug = await uniqueOrgSlug(c.env, company);
  const trialEnds = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

  // Create user + org + membership in sequence
  const userRows = await sql`
    INSERT INTO users (email, password_hash, name, phone, email_verified_at)
    VALUES (${email}, ${pwHash}, ${name}, ${phone}, now())
    RETURNING id
  `;
  const userId: string = userRows[0].id;

  const orgRows = await sql`
    INSERT INTO organizations (slug, display_name, reply_to_email, notify_email, phone, status, trial_ends_at, sending_mode)
    VALUES (${slug}, ${company}, ${email}, ${email}, ${phone}, 'trial', ${trialEnds}, 'shared')
    RETURNING id
  `;
  const orgId: string = orgRows[0].id;

  await sql`
    INSERT INTO memberships (user_id, organization_id, role, accepted_at)
    VALUES (${userId}, ${orgId}, 'owner', now())
  `;

  // Create session
  const token = await createSession(c.env, userId, orgId, {
    ip: c.req.header("cf-connecting-ip"),
    ua: c.req.header("user-agent"),
  });
  const domain = cookieDomain(c.env.SITE_URL);
  setSessionCookie(c, token, domain);

  const subUrl = orgBaseUrl(slug, c.env.SITE_URL);

  // Fire-and-forget welcome email
  c.executionCtx.waitUntil((async () => {
    await sendPlatformEmail(c.env, {
      to: [email],
      subject: "Welcome to KnoqGen — your trial has started",
      html: `<p>Hi ${esc(name)},</p>
        <p>Your 14-day free trial for <strong>${esc(company)}</strong> is active.</p>
        <p>Your account URL: <a href="${subUrl}/rep">${subUrl}</a></p>
        <p>Need help? Reply to this email.</p>
        <p>— KnoqGen</p>`,
    });
    await sendPlatformEmail(c.env, {
      to: ["hello@knoqgen.com"],
      subject: `New self-signup: ${company}`,
      html: `<p>${esc(name)} &lt;${esc(email)}&gt; signed up. URL: <a href="${subUrl}">${subUrl}</a> &nbsp;|&nbsp; slug: <code>${esc(slug)}</code>.</p>`,
    });
  })());

  // Redirect to their subdomain welcome page
  return c.redirect(`${subUrl}/onboarding/welcome`);
});

// ──────────────────────────────────────────────────────────
// Org onboarding — minimal welcome after signup
// ──────────────────────────────────────────────────────────
auth.get("/onboarding/welcome", async (c) => {
  const s = await resolveSession(c);
  if (!s) return c.redirect("/login");
  return c.html(adminLayout("Welcome", `
    <div class="card" style="text-align:center;padding:40px 20px">
      <h1>You're in!</h1>
      <p class="text-muted" style="font-size:16px">Your 14-day trial has started.</p>
      <p style="margin:16px 0">Create your first door knock to see it in action.</p>
      <a href="/rep/new" class="btn" style="display:inline-block;margin-top:12px">+ Create Door Knock</a>
      <br>
      <a href="/rep" class="btn btn-outline" style="display:inline-block;margin-top:12px">Skip to Dashboard</a>
    </div>
  `));
});

// For super-admins without a current org (shouldn't happen for David after migration)
auth.get("/onboarding/new-org", async (c) => {
  const s = await resolveSession(c);
  if (!s) return c.redirect("/login");
  return c.html(adminLayout("Join an Organization", `
    <div class="card">
      <h1>No organization yet</h1>
      <p class="text-muted">You don't belong to any organization. Ask your admin for an invite, or contact support.</p>
      <p style="margin-top:16px"><a href="/logout" class="btn btn-outline">Sign Out</a></p>
    </div>
  `, false));
});

// ──────────────────────────────────────────────────────────
// Org switcher
// ──────────────────────────────────────────────────────────
auth.post("/switch-org", async (c) => {
  const s = await resolveSession(c);
  if (!s) return c.redirect("/login");
  const form = await c.req.parseBody();
  const orgId = String(form.organization_id || "");
  const mem = s.memberships.find(m => m.organization_id === orgId);
  if (!mem && !s.user.is_super_admin) return c.text("Forbidden", 403);
  await setActiveOrg(c.env, s.rawToken, orgId);
  return c.redirect("/rep");
});

// ──────────────────────────────────────────────────────────
// Invite flow — owner invites a rep
// ──────────────────────────────────────────────────────────
auth.post("/invites", async (c) => {
  const s = await resolveSession(c);
  if (!s || !s.org) return c.redirect("/login");
  const mem = s.memberships.find(m => m.organization_id === s.org!.id);
  if (!mem || mem.role !== "owner") return c.text("Forbidden", 403);

  const form = await c.req.parseBody();
  const email = String(form.email || "").trim().toLowerCase();
  const role = (String(form.role || "rep") === "owner" ? "owner" : "rep");
  if (!email) return c.redirect("/admin/team");

  const sql = getDb(c.env);

  // Find or create user (pending password)
  let userId: string;
  const uRows = await sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  if (uRows.length) {
    userId = uRows[0].id;
  } else {
    const u = await sql`INSERT INTO users (email) VALUES (${email}) RETURNING id`;
    userId = u[0].id;
  }

  const token = randomToken(24);
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await sql`
    INSERT INTO memberships (user_id, organization_id, role, invited_by, invite_token, invite_expires_at)
    VALUES (${userId}, ${s.org.id}, ${role}, ${s.user.id}, ${token}, ${expires})
    ON CONFLICT (user_id, organization_id) DO UPDATE
      SET role = EXCLUDED.role,
          invite_token = EXCLUDED.invite_token,
          invite_expires_at = EXCLUDED.invite_expires_at,
          is_active = true
  `;

  const inviteUrl = `${orgBaseUrl(s.org.slug, c.env.SITE_URL)}/invite/${token}`;
  c.executionCtx.waitUntil(sendOrgEmail(c.env, s.org, {
    to: [email],
    subject: `You've been invited to ${s.org.display_name}`,
    html: `<p>${esc(s.user.name || s.user.email)} invited you to join <strong>${esc(s.org.display_name)}</strong> on KnoqGen.</p>
      <p><a href="${inviteUrl}">Accept invite</a> (expires in 7 days)</p>`,
  }).then(() => {}));

  return c.redirect("/admin/team");
});

auth.get("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const sql = getDb(c.env);
  const rows = await sql`
    SELECT m.id, m.user_id, m.organization_id, m.role, m.accepted_at,
           u.email, u.password_hash, o.display_name
    FROM memberships m
    JOIN users u ON m.user_id = u.id
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.invite_token = ${token} AND m.invite_expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) {
    return c.html(formCard("Invite Invalid", `<p><a href="/login">Go to sign in</a></p>`,
      "This invite is invalid or has expired."), 400);
  }
  const inv: any = rows[0];
  return c.html(formCard(`Join ${inv.display_name}`, `
    <p class="text-muted">Set a password to accept your invite for <strong>${esc(inv.email)}</strong>.</p>
    <form method="POST" action="/invite/${esc(token)}">
      <div class="form-group"><label>Your Name</label><input type="text" name="name" required autofocus></div>
      <div class="form-group"><label>Password (8+ chars)</label><input type="password" name="password" minlength="8" required></div>
      <button type="submit" class="btn" style="width:100%">Accept Invite</button>
    </form>
  `));
});

auth.post("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.parseBody();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  if (!name || password.length < 8) {
    return c.redirect(`/invite/${token}`);
  }

  const sql = getDb(c.env);
  const rows = await sql`
    SELECT m.id, m.user_id, m.organization_id
    FROM memberships m
    WHERE m.invite_token = ${token} AND m.invite_expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) return c.text("Invite expired", 400);
  const inv: any = rows[0];

  const pwHash = await hashPassword(password);
  await sql`UPDATE users SET password_hash = ${pwHash}, name = ${name}, email_verified_at = now() WHERE id = ${inv.user_id}`;
  await sql`UPDATE memberships SET accepted_at = now(), invite_token = NULL WHERE id = ${inv.id}`;

  // Load org slug so we can redirect to the right subdomain
  const orgRow = await sql`SELECT slug FROM organizations WHERE id = ${inv.organization_id} LIMIT 1`;
  const orgSlug = orgRow[0]?.slug || null;

  const sessToken = await createSession(c.env, inv.user_id, inv.organization_id, {
    ip: c.req.header("cf-connecting-ip"),
    ua: c.req.header("user-agent"),
  });
  setSessionCookie(c, sessToken, cookieDomain(c.env.SITE_URL));
  const repUrl = orgSlug ? `${orgBaseUrl(orgSlug, c.env.SITE_URL)}/rep` : "/rep";
  return c.redirect(repUrl);
});

// ──────────────────────────────────────────────────────────
// Forgot password (simple reset via emailed link)
// ──────────────────────────────────────────────────────────
auth.get("/forgot", (c) => {
  return c.html(formCard("Reset Password", `
    <form method="POST" action="/forgot">
      <div class="form-group"><label>Email</label><input type="email" name="email" required autofocus></div>
      <button type="submit" class="btn" style="width:100%">Send Reset Link</button>
    </form>
  `));
});

auth.post("/forgot", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || "").trim().toLowerCase();
  const sql = getDb(c.env);
  const rows = await sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  if (rows.length) {
    const userId = rows[0].id;
    const token = randomToken(24);
    const expires = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    // Store reset token in a transient session row
    await sql`
      INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
      VALUES (${userId}, ${"reset:" + token}, ${expires}, 'password-reset')
    `;
    c.executionCtx.waitUntil(sendPlatformEmail(c.env, {
      to: [email],
      subject: "Reset your KnoqGen password",
      html: `<p>Click to reset: <a href="${c.env.SITE_URL}/reset/${token}">${c.env.SITE_URL}/reset/${token}</a> (expires in 2 hours)</p>`,
    }).then(() => {}));
  }
  return c.html(formCard("Check Your Email", `
    <p>If an account exists for that email, we've sent a reset link.</p>
    <p style="margin-top:12px"><a href="/login" class="btn">Back to Sign In</a></p>
  `));
});

auth.get("/reset/:token", async (c) => {
  const token = c.req.param("token");
  const sql = getDb(c.env);
  const rows = await sql`
    SELECT user_id FROM sessions WHERE token_hash = ${"reset:" + token} AND expires_at > now() LIMIT 1
  `;
  if (!rows.length) return c.html(formCard("Link Expired", `<p><a href="/forgot">Request a new link</a></p>`), 400);
  return c.html(formCard("Set New Password", `
    <form method="POST" action="/reset/${esc(token)}">
      <div class="form-group"><label>New Password</label><input type="password" name="password" minlength="8" required autofocus></div>
      <button type="submit" class="btn" style="width:100%">Update Password</button>
    </form>
  `));
});

auth.post("/reset/:token", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.parseBody();
  const password = String(body.password || "");
  if (password.length < 8) return c.redirect(`/reset/${token}`);
  const sql = getDb(c.env);
  const rows = await sql`
    SELECT user_id FROM sessions WHERE token_hash = ${"reset:" + token} AND expires_at > now() LIMIT 1
  `;
  if (!rows.length) return c.text("Link expired", 400);
  const userId = rows[0].user_id;
  const pwHash = await hashPassword(password);
  await sql`UPDATE users SET password_hash = ${pwHash} WHERE id = ${userId}`;
  await sql`DELETE FROM sessions WHERE token_hash = ${"reset:" + token}`;
  return c.redirect("/login");
});

export default auth;
