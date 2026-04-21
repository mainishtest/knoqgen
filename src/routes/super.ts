// Super-admin panel. Cross-org views + trial provisioning.
// Gated by requireSuperAdmin middleware (u.is_super_admin = true).

import { Hono } from "hono";
import { getDb, type Env } from "../lib/db";
import { adminLayout, esc } from "../lib/html";
import { requireSuperAdmin, setActiveOrg, layoutCtx, type Ctx } from "../lib/session";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../lib/session";
import { sendPlatformEmail } from "../lib/email";
import { randomToken } from "../lib/password";
import { writeAudit } from "../lib/audit";

const sup = new Hono<Ctx>();

sup.use("/super", requireSuperAdmin);
sup.use("/super/*", requireSuperAdmin);

// ── Dashboard ──
sup.get("/super", async (c) => {
  const sql = getDb(c.env);
  const orgs = await sql`
    SELECT o.id, o.slug, o.display_name, o.status, o.plan, o.billing_status,
           o.trial_ends_at, o.sending_mode, o.custom_landing_domain, o.custom_landing_verified,
           o.created_at,
           (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id AND m.is_active) AS member_count,
           (SELECT COUNT(*) FROM landing_pages lp WHERE lp.organization_id = o.id) AS pages_count,
           (SELECT COUNT(*) FROM leads l WHERE l.organization_id = o.id) AS leads_count,
           (SELECT COUNT(*) FROM landing_pages lp WHERE lp.organization_id = o.id AND lp.created_at > now() - INTERVAL '30 days') AS pages_30d,
           (SELECT COUNT(*) FROM leads l WHERE l.organization_id = o.id AND l.created_at > now() - INTERVAL '30 days') AS leads_30d
    FROM organizations o
    ORDER BY o.created_at DESC
  `;
  const pending = await sql`
    SELECT id, email, name, company, status, created_at
    FROM trial_signups
    WHERE provisioned_org_id IS NULL
    ORDER BY created_at DESC
    LIMIT 50
  `;
  const totals = await sql`
    SELECT
      (SELECT COUNT(*) FROM organizations) AS orgs,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM landing_pages) AS pages,
      (SELECT COUNT(*) FROM leads) AS leads,
      (SELECT COUNT(*) FROM leads WHERE created_at > now() - INTERVAL '30 days') AS leads_30d,
      (SELECT COUNT(*) FROM leads WHERE status = 'won') AS won_all,
      (SELECT COUNT(*) FROM leads WHERE status = 'won' AND created_at > now() - INTERVAL '30 days') AS won_30d,
      (SELECT COALESCE(SUM(job_value), 0) FROM leads WHERE status = 'won') AS revenue_all,
      (SELECT COALESCE(SUM(scan_count), 0) FROM landing_pages) AS scans_all,
      (SELECT COUNT(*) FROM organizations WHERE status = 'trial') AS trial_orgs,
      (SELECT COUNT(*) FROM organizations WHERE status = 'active') AS active_orgs
  `;
  const t: any = totals[0];

  const rowsHtml = orgs.map((o: any) => {
    const trial = o.trial_ends_at ? `trial until ${new Date(o.trial_ends_at).toLocaleDateString()}` : "";
    return `<tr>
      <td><strong>${esc(o.display_name)}</strong><br><span class="text-muted">${esc(o.slug)}</span></td>
      <td><span class="badge ${o.status === 'active' ? 'badge-active' : 'badge-inactive'}">${esc(o.status)}</span><br><span class="text-muted">${esc(o.plan || '-')} / ${esc(o.billing_status || '-')}</span><br><span class="text-muted">${esc(trial)}</span></td>
      <td>${o.member_count}</td>
      <td>${o.pages_count} <span class="text-muted">(${o.pages_30d} /30d)</span></td>
      <td>${o.leads_count} <span class="text-muted">(${o.leads_30d} /30d)</span></td>
      <td>${o.custom_landing_domain ? `${esc(o.custom_landing_domain)} ${o.custom_landing_verified ? '✓' : '⏳'}` : '<span class="text-muted">—</span>'}</td>
      <td>
        <form method="POST" action="/super/switch" style="display:inline"><input type="hidden" name="org_id" value="${o.id}"><button class="btn btn-sm btn-outline" type="submit">Switch</button></form>
        <a class="btn btn-sm btn-outline" href="/super/org/${o.id}">Manage</a>
      </td>
    </tr>`;
  }).join("");

  const pendingHtml = pending.length ? pending.map((p: any) => `<tr>
    <td><strong>${esc(p.company || "—")}</strong><br><span class="text-muted">${esc(p.email)}</span></td>
    <td>${esc(p.name || "—")}</td>
    <td>${esc(p.status)}</td>
    <td>${new Date(p.created_at).toLocaleDateString()}</td>
    <td><a class="btn btn-sm" href="/super/provision/${p.id}">Provision</a></td>
  </tr>`).join("") : `<tr><td colspan="5" class="text-muted">No pending trial signups.</td></tr>`;

  return c.html(adminLayout("Super Admin", `
    <h1>Super Admin</h1>
    <p class="text-muted mb-4">Logged in as ${esc(c.get("user").email)} — cross-org view &middot; <a href="/super/orders">orders</a> &middot; <a href="/super/audit">audit log</a></p>

    <div class="stat-grid">
      <div class="stat-card"><div class="number">${t.active_orgs}<span style="font-size:14px;color:#888">/${t.orgs}</span></div><div class="label">Active / Total Orgs</div></div>
      <div class="stat-card"><div class="number">${t.users}</div><div class="label">Users</div></div>
      <div class="stat-card"><div class="number">${t.scans_all}</div><div class="label">Total Scans</div></div>
      <div class="stat-card"><div class="number">${t.pages}</div><div class="label">Landing Pages</div></div>
      <div class="stat-card"><div class="number">${t.leads} <span style="font-size:14px;color:#888">(${t.leads_30d} /30d)</span></div><div class="label">Leads</div></div>
      <div class="stat-card"><div class="number">${t.won_all} <span style="font-size:14px;color:#888">(${t.won_30d} /30d)</span></div><div class="label">Jobs Won</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h2 style="margin-top:0">Quick User Search</h2>
      <form method="GET" action="/super/users" style="display:flex;gap:8px">
        <input name="q" placeholder="Search by email or name" style="flex:1;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px">
        <button class="btn" type="submit">Search</button>
      </form>
    </div>

    <h2>Pending trial signups</h2>
    <div class="card"><table>
      <tr><th>Company</th><th>Name</th><th>Status</th><th>Created</th><th></th></tr>
      ${pendingHtml}
    </table></div>

    <h2>Organizations</h2>
    <div class="card"><table>
      <tr><th>Org</th><th>Status</th><th>Members</th><th>Pages</th><th>Leads</th><th>Landing Domain</th><th></th></tr>
      ${rowsHtml}
    </table></div>
  `, layoutCtx(c)));
});

// ── Switch active org (super-admin can jump into any org) ──
sup.post("/super/switch", async (c) => {
  const form = await c.req.formData();
  const orgId = String(form.get("org_id") || "");
  if (!orgId) return c.redirect("/super");
  const sql = getDb(c.env);
  // Ensure super-admin has membership in that org (auto-create owner membership if missing)
  const user = c.get("user");
  const existing = await sql`SELECT 1 FROM memberships WHERE user_id = ${user.id} AND organization_id = ${orgId}`;
  if (!existing.length) {
    await sql`
      INSERT INTO memberships (user_id, organization_id, role, is_active, accepted_at)
      VALUES (${user.id}, ${orgId}, 'owner', true, now())
    `;
  }
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) await setActiveOrg(c.env, raw, orgId);
  await writeAudit(c.env, c, {
    actorUserId: user.id, actorEmail: user.email, organizationId: orgId,
    action: "org.switch_in", targetKind: "organization", targetId: orgId,
    metadata: { auto_membership: !existing.length },
  });
  return c.redirect("/admin");
});

// ── Org detail / management ──
sup.get("/super/org/:id", async (c) => {
  const sql = getDb(c.env);
  const id = c.req.param("id");
  const rows = await sql`SELECT * FROM organizations WHERE id = ${id}`;
  if (!rows.length) return c.text("Not found", 404);
  const o: any = rows[0];
  const members = await sql`
    SELECT u.email, u.name, m.role, m.is_active, m.accepted_at
    FROM memberships m JOIN users u ON m.user_id = u.id
    WHERE m.organization_id = ${id}
    ORDER BY m.role, u.email
  `;

  return c.html(adminLayout(`Manage ${o.display_name}`, `
    <p><a href="/super">← back to super-admin</a></p>
    <h1>${esc(o.display_name)} <span class="text-muted" style="font-size:14px">${esc(o.slug)}</span></h1>

    <div class="card">
      <h2 style="margin-top:0">Billing & Status</h2>
      <form method="POST" action="/super/org/${id}/status">
        <div class="form-group">
          <label>Status</label>
          <select name="status">
            ${["trial","active","suspended","canceled"].map(s => `<option value="${s}" ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Plan</label>
          <input name="plan" value="${esc(o.plan || "")}" placeholder="e.g. starter">
        </div>
        <div class="form-group">
          <label>Trial ends at</label>
          <input type="date" name="trial_ends_at" value="${o.trial_ends_at ? new Date(o.trial_ends_at).toISOString().slice(0,10) : ""}">
        </div>
        <button class="btn" type="submit">Save</button>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Members</h2>
      <table>
        <tr><th>Email</th><th>Name</th><th>Role</th><th>Active</th><th>Accepted</th></tr>
        ${members.map((m: any) => `<tr>
          <td>${esc(m.email)}</td>
          <td>${esc(m.name || "—")}</td>
          <td>${esc(m.role)}</td>
          <td>${m.is_active ? "yes" : "no"}</td>
          <td>${m.accepted_at ? new Date(m.accepted_at).toLocaleDateString() : "pending"}</td>
        </tr>`).join("")}
      </table>
    </div>
  `, layoutCtx(c)));
});

sup.post("/super/org/:id/status", async (c) => {
  const sql = getDb(c.env);
  const id = c.req.param("id");
  const form = await c.req.formData();
  const status = String(form.get("status") || "trial");
  const plan = String(form.get("plan") || "") || null;
  const trialRaw = String(form.get("trial_ends_at") || "");
  const trialEnds = trialRaw ? new Date(trialRaw).toISOString() : null;
  await sql`
    UPDATE organizations
    SET status = ${status}, plan = ${plan}, trial_ends_at = ${trialEnds}, updated_at = now()
    WHERE id = ${id}
  `;
  const actor = c.get("user");
  await writeAudit(c.env, c, {
    actorUserId: actor.id, actorEmail: actor.email, organizationId: id,
    action: "org.status_change", targetKind: "organization", targetId: id,
    metadata: { status, plan, trial_ends_at: trialEnds },
  });
  return c.redirect(`/super/org/${id}`);
});

// ── Provision a trial signup into an org ──
sup.get("/super/provision/:id", async (c) => {
  const sql = getDb(c.env);
  const id = c.req.param("id");
  const rows = await sql`SELECT * FROM trial_signups WHERE id = ${id}`;
  if (!rows.length) return c.text("Not found", 404);
  const t: any = rows[0];
  const suggestedSlug = (t.company || t.email.split("@")[0])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return c.html(adminLayout("Provision trial", `
    <p><a href="/super">← back to super-admin</a></p>
    <h1>Provision trial</h1>
    <div class="card">
      <p><strong>Email:</strong> ${esc(t.email)}</p>
      <p><strong>Name:</strong> ${esc(t.name || "")}</p>
      <p><strong>Company:</strong> ${esc(t.company || "")}</p>
      <p><strong>Phone:</strong> ${esc(t.phone || "")}</p>
    </div>
    <form method="POST" action="/super/provision/${id}" class="card">
      <div class="form-group">
        <label>Org slug (used in URLs + sending address)</label>
        <input name="slug" value="${esc(suggestedSlug)}" required pattern="[a-z0-9-]+">
      </div>
      <div class="form-group">
        <label>Display name</label>
        <input name="display_name" value="${esc(t.company || t.name || "")}" required>
      </div>
      <div class="form-group">
        <label>Reply-to email</label>
        <input name="reply_to_email" type="email" value="${esc(t.email)}" required>
      </div>
      <div class="form-group">
        <label>Owner email (invite)</label>
        <input name="owner_email" type="email" value="${esc(t.email)}" required>
      </div>
      <div class="form-group">
        <label>Owner name</label>
        <input name="owner_name" value="${esc(t.name || "")}">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input name="phone" value="${esc(t.phone || "")}">
      </div>
      <div class="form-group">
        <label>Trial length (days)</label>
        <input name="trial_days" type="number" value="14" min="1" max="365">
      </div>
      <button class="btn" type="submit">Provision & email invite</button>
    </form>
  `, layoutCtx(c)));
});

sup.post("/super/provision/:id", async (c) => {
  const sql = getDb(c.env);
  const id = c.req.param("id");
  const form = await c.req.formData();
  const slug = String(form.get("slug") || "").toLowerCase().trim();
  const displayName = String(form.get("display_name") || "").trim();
  const replyTo = String(form.get("reply_to_email") || "").trim();
  const ownerEmail = String(form.get("owner_email") || "").trim().toLowerCase();
  const ownerName = String(form.get("owner_name") || "").trim() || null;
  const phone = String(form.get("phone") || "").trim() || null;
  const trialDays = Math.max(1, Math.min(365, parseInt(String(form.get("trial_days") || "14"), 10)));

  if (!slug || !displayName || !replyTo || !ownerEmail) {
    return c.text("Missing fields", 400);
  }

  // Check slug uniqueness
  const dup = await sql`SELECT 1 FROM organizations WHERE slug = ${slug}`;
  if (dup.length) return c.text(`Slug already in use: ${slug}`, 400);

  const actorId = c.get("user").id;
  const actorEmail = c.get("user").email;
  const inviteToken = randomToken(24);
  const trialInterval = `${trialDays} days`;

  // Run all DB writes in a single SQL DO block so it's atomic
  const result = await sql`
    WITH new_org AS (
      INSERT INTO organizations (slug, display_name, reply_to_email, notify_email, phone, status, trial_ends_at, sending_mode)
      VALUES (${slug}, ${displayName}, ${replyTo}, ${replyTo}, ${phone}, 'trial', now() + ${trialInterval}::INTERVAL, 'shared')
      RETURNING id
    ),
    new_user AS (
      INSERT INTO users (email, name)
      VALUES (${ownerEmail}, ${ownerName})
      ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name)
      RETURNING id
    ),
    new_mem AS (
      INSERT INTO memberships (user_id, organization_id, role, invite_token, invite_expires_at, invited_by)
      SELECT new_user.id, new_org.id, 'owner', ${inviteToken}, now() + ${trialInterval}::INTERVAL, ${actorId}::UUID
      FROM new_user, new_org
      RETURNING organization_id
    ),
    link_trial AS (
      UPDATE trial_signups
      SET provisioned_org_id = (SELECT id FROM new_org),
          status = 'converted'
      WHERE id = ${id}
    )
    SELECT id FROM new_org
  `;
  const orgId = result[0].id;

  // Send invite email (outside transaction — OK if this fails, org still exists)
  const inviteUrl = `${c.env.SITE_URL || 'https://knoqgen.com'}/invite/${inviteToken}`;
  const html = `
    <p>Hi${ownerName ? " " + esc(ownerName) : ""},</p>
    <p>Your KnoqGen trial for <strong>${esc(displayName)}</strong> is ready.</p>
    <p>Click below to set your password and get started. Your trial runs for ${trialDays} days.</p>
    <p><a href="${inviteUrl}" style="background:#8145FC;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px;display:inline-block">Accept invite & set password</a></p>
    <p>Or copy this link: ${inviteUrl}</p>
  `;
  c.executionCtx.waitUntil(
    sendPlatformEmail(c.env, {
      to: [ownerEmail],
      subject: `Your ${displayName} trial is ready`,
      html,
    })
  );

  c.executionCtx.waitUntil(
    writeAudit(c.env, c, {
      actorUserId: actorId, actorEmail, organizationId: orgId,
      action: "org.provision", targetKind: "organization", targetId: orgId,
      metadata: { slug, display_name: displayName, owner_email: ownerEmail, trial_days: trialDays, from_trial_signup: id },
    })
  );

  return c.redirect(`/super/org/${orgId}`);
});

// ── User search ──
sup.get("/super/users", async (c) => {
  const sql = getDb(c.env);
  const q = new URL(c.req.url).searchParams.get("q")?.trim() || "";

  const users = q
    ? await sql`
        SELECT u.id, u.email, u.name, u.is_super_admin, u.last_login_at, u.created_at,
          (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id AND m.is_active) as org_count
        FROM users u
        WHERE LOWER(u.email) LIKE ${"%" + q.toLowerCase() + "%"}
           OR LOWER(COALESCE(u.name, '')) LIKE ${"%" + q.toLowerCase() + "%"}
        ORDER BY u.created_at DESC LIMIT 50
      `
    : await sql`
        SELECT u.id, u.email, u.name, u.is_super_admin, u.last_login_at, u.created_at,
          (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id AND m.is_active) as org_count
        FROM users u
        ORDER BY u.created_at DESC LIMIT 50
      `;

  const rowsHtml = users.map((u: any) => `<tr>
    <td><strong>${esc(u.name || "—")}</strong><br><span class="text-muted">${esc(u.email)}</span></td>
    <td>${u.is_super_admin ? '<span class="badge badge-active">super</span>' : ""}</td>
    <td>${u.org_count}</td>
    <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '<span class="text-muted">never</span>'}</td>
    <td>${new Date(u.created_at).toLocaleDateString()}</td>
  </tr>`).join("");

  return c.html(adminLayout("Users", `
    <p><a href="/super">← back to super-admin</a></p>
    <h1>Users ${q ? `matching "${esc(q)}"` : "(recent)"}</h1>
    <form method="GET" action="/super/users" style="margin-bottom:16px;display:flex;gap:8px">
      <input name="q" value="${esc(q)}" placeholder="Search by email or name" style="flex:1;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px">
      <button class="btn btn-sm" type="submit">Search</button>
    </form>
    <div class="card"><table>
      <tr><th>User</th><th>Role</th><th>Orgs</th><th>Last Login</th><th>Created</th></tr>
      ${rowsHtml}
    </table></div>
  `, layoutCtx(c)));
});

// ── Hardware orders ──
sup.get("/super/orders", async (c) => {
  const sql = getDb(c.env);
  const statusFilter = new URL(c.req.url).searchParams.get("status") || "";

  const orders = statusFilter
    ? await sql`
        SELECT ho.*, ts.email AS buyer_email, ts.company AS buyer_company
        FROM hardware_orders ho
        LEFT JOIN trial_signups ts ON ho.trial_signup_id = ts.id
        WHERE ho.fulfillment_status = ${statusFilter}
        ORDER BY ho.created_at DESC LIMIT 200
      `
    : await sql`
        SELECT ho.*, ts.email AS buyer_email, ts.company AS buyer_company
        FROM hardware_orders ho
        LEFT JOIN trial_signups ts ON ho.trial_signup_id = ts.id
        ORDER BY ho.created_at DESC LIMIT 200
      `;

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: "background:#fff3cd;color:#856404",
      processing: "background:#cfe2ff;color:#0842a0",
      shipped: "background:#d1ecf1;color:#0c5460",
      delivered: "background:#d4edda;color:#155724",
      canceled: "background:#f8d7da;color:#721c24",
      refunded: "background:#e2e3e5;color:#383d41",
    };
    const style = colors[s] || "";
    return `<span style="${style};padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">${esc(s)}</span>`;
  };

  const tbody = orders.length ? orders.map((o: any) => {
    const addr = o.shipping_address || {};
    const addrStr = [addr.line1, addr.city, addr.state, addr.postal_code].filter(Boolean).join(", ");
    return `<tr>
      <td style="white-space:nowrap;font-size:12px;color:#888">${new Date(o.created_at).toLocaleDateString()}</td>
      <td>
        <strong>${esc(o.shipping_name || "—")}</strong><br>
        <span style="font-size:12px;color:#888">${esc(o.buyer_email || o.shipping_email || "—")}</span><br>
        <span style="font-size:11px;color:#aaa">${esc(o.buyer_company || "—")}</span>
      </td>
      <td style="text-align:center"><strong>${esc(String(o.qty))}</strong></td>
      <td style="text-align:right"><strong>$${((o.total_cents || 0) / 100).toFixed(2)}</strong></td>
      <td>${statusBadge(o.fulfillment_status)}</td>
      <td style="font-size:12px">${esc(addrStr || "—")}</td>
      <td style="font-size:12px">${o.tracking_number ? `${esc(o.carrier || "")} <code>${esc(o.tracking_number)}</code>` : '<span style="color:#aaa">—</span>'}</td>
      <td>
        <a class="btn btn-sm" href="/super/orders/${esc(o.id)}/ship" style="font-size:12px">Ship</a>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="8" style="color:#aaa;text-align:center;padding:20px">No orders yet.</td></tr>`;

  const statuses = ["pending", "processing", "shipped", "delivered", "canceled"];
  const filterTabs = statuses.map(s =>
    `<a href="/super/orders?status=${s}" style="padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;${statusFilter === s ? "background:#8145FC;color:#fff" : "background:#f0f0f0;color:#555"}">${s}</a>`
  ).join("");

  return c.html(adminLayout("Hardware Orders", `
    <p><a href="/super">← back to super-admin</a></p>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h1>Hardware Orders</h1>
      <span style="font-size:13px;color:#888">${orders.length} order${orders.length !== 1 ? "s" : ""}</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <a href="/super/orders" style="padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;${!statusFilter ? "background:#8145FC;color:#fff" : "background:#f0f0f0;color:#555"}">All</a>
      ${filterTabs}
    </div>
    <div class="card" style="overflow-x:auto"><table>
      <tr><th>Date</th><th>Buyer</th><th>Qty</th><th>Total</th><th>Status</th><th>Ship To</th><th>Tracking</th><th></th></tr>
      ${tbody}
    </table></div>
  `, layoutCtx(c)));
});

// ── Mark order as shipped ──
sup.get("/super/orders/:id/ship", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env);
  const rows = await sql`SELECT * FROM hardware_orders WHERE id = ${id}`;
  if (!rows.length) return c.text("Not found", 404);
  const o: any = rows[0];
  const addr = o.shipping_address || {};
  const addrStr = [addr.line1, addr.city, addr.state, addr.postal_code].filter(Boolean).join(", ");

  return c.html(adminLayout("Ship Order", `
    <p><a href="/super/orders">← back to orders</a></p>
    <h1>Ship Order</h1>
    <div class="card" style="margin-bottom:16px">
      <p><strong>Buyer:</strong> ${esc(o.shipping_name || "—")} &mdash; ${esc(o.shipping_email || "—")}</p>
      <p><strong>Ship to:</strong> ${esc(addrStr || "—")}</p>
      <p><strong>Qty:</strong> ${esc(String(o.qty))} &mdash; <strong>Total:</strong> $${((o.total_cents || 0) / 100).toFixed(2)}</p>
    </div>
    <form method="POST" action="/super/orders/${esc(id)}/ship" class="card">
      <div class="form-group">
        <label>Status</label>
        <select name="status">
          <option value="processing" ${o.fulfillment_status === "processing" ? "selected" : ""}>Processing</option>
          <option value="shipped" ${o.fulfillment_status === "shipped" ? "selected" : ""}>Shipped</option>
          <option value="delivered" ${o.fulfillment_status === "delivered" ? "selected" : ""}>Delivered</option>
          <option value="canceled" ${o.fulfillment_status === "canceled" ? "selected" : ""}>Canceled</option>
          <option value="refunded" ${o.fulfillment_status === "refunded" ? "selected" : ""}>Refunded</option>
        </select>
      </div>
      <div class="form-group">
        <label>Carrier</label>
        <select name="carrier">
          <option value="">Select carrier…</option>
          <option value="USPS">USPS</option>
          <option value="UPS">UPS</option>
          <option value="FedEx">FedEx</option>
          <option value="Amazon">Amazon (MCF)</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Tracking number</label>
        <input name="tracking_number" value="${esc(o.tracking_number || "")}" placeholder="1Z999AA10123456784">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes" rows="2" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px">${esc(o.notes || "")}</textarea>
      </div>
      <button class="btn" type="submit">Save &amp; Update</button>
    </form>
  `, layoutCtx(c)));
});

sup.post("/super/orders/:id/ship", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env);
  const form = await c.req.formData();
  const status = String(form.get("status") || "processing");
  const carrier = String(form.get("carrier") || "").trim() || null;
  const trackingNumber = String(form.get("tracking_number") || "").trim() || null;
  const notes = String(form.get("notes") || "").trim() || null;

  const validStatuses = ["pending", "processing", "shipped", "delivered", "canceled", "refunded"];
  if (!validStatuses.includes(status)) return c.text("Invalid status", 400);

  await sql`
    UPDATE hardware_orders
    SET fulfillment_status = ${status},
        carrier = ${carrier},
        tracking_number = ${trackingNumber},
        notes = ${notes},
        updated_at = now()
    WHERE id = ${id}
  `;

  return c.redirect("/super/orders");
});

// ── Audit log viewer ──
sup.get("/super/audit", async (c) => {
  const sql = getDb(c.env);
  const url = new URL(c.req.url);
  const actionFilter = url.searchParams.get("action") || "";
  const orgFilter = url.searchParams.get("org") || "";
  const rows = actionFilter || orgFilter
    ? await sql`
        SELECT a.*, o.display_name as org_name, o.slug as org_slug
        FROM audit_log a
        LEFT JOIN organizations o ON a.organization_id = o.id
        WHERE (${actionFilter}::text = '' OR a.action = ${actionFilter})
          AND (${orgFilter}::text = '' OR a.organization_id::text = ${orgFilter})
        ORDER BY a.created_at DESC LIMIT 300
      `
    : await sql`
        SELECT a.*, o.display_name as org_name, o.slug as org_slug
        FROM audit_log a
        LEFT JOIN organizations o ON a.organization_id = o.id
        ORDER BY a.created_at DESC LIMIT 300
      `;

  const tbody = rows.length ? rows.map((r: any) => `<tr>
    <td style="white-space:nowrap">${new Date(r.created_at).toLocaleString()}</td>
    <td>${esc(r.actor_email || "—")}</td>
    <td><code>${esc(r.action)}</code></td>
    <td>${r.org_name ? `${esc(r.org_name)} <span class="text-muted">${esc(r.org_slug || "")}</span>` : '<span class="text-muted">—</span>'}</td>
    <td>${esc(r.target_kind || "—")}${r.target_id ? ` / <code style="font-size:11px">${esc(String(r.target_id).slice(0, 8))}…</code>` : ""}</td>
    <td><pre style="font-size:11px;margin:0;white-space:pre-wrap;max-width:320px">${esc(JSON.stringify(r.metadata))}</pre></td>
    <td class="text-muted" style="font-size:11px">${esc(r.ip || "")}</td>
  </tr>`).join("") : `<tr><td colspan="7" class="text-muted">No audit entries.</td></tr>`;

  return c.html(adminLayout("Audit log", `
    <p><a href="/super">← back to super-admin</a></p>
    <h1>Audit log</h1>
    <form method="GET" action="/super/audit" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
      <input name="action" placeholder="Filter by action (e.g. org.provision)" value="${esc(actionFilter)}" style="padding:8px;border:1px solid #ddd;border-radius:6px;flex:1;min-width:200px">
      <input name="org" placeholder="Filter by org UUID" value="${esc(orgFilter)}" style="padding:8px;border:1px solid #ddd;border-radius:6px;flex:1;min-width:200px">
      <button class="btn btn-sm" type="submit">Filter</button>
      ${actionFilter || orgFilter ? `<a class="btn btn-sm btn-outline" href="/super/audit">Reset</a>` : ""}
    </form>
    <div class="card"><table>
      <tr><th>When</th><th>Actor</th><th>Action</th><th>Org</th><th>Target</th><th>Metadata</th><th>IP</th></tr>
      ${tbody}
    </table></div>
  `, layoutCtx(c)));
});

export default sup;
