import { Hono } from "hono";
import { getDb, type Env } from "../lib/db";
import { requireAuth, requireOwner, resolveSession, type Ctx } from "../lib/session";
import {
  sendOrgEmail,
  resendCreateDomain, resendGetDomain, resendVerifyDomain, resendDeleteDomain,
} from "../lib/email";
import { writeAudit } from "../lib/audit";
import { orgBaseUrl } from "../lib/subdomain";

const api = new Hono<Ctx>();

// Protected write APIs
api.use("/api/upload", requireAuth);
api.use("/api/upload-photo", requireAuth);
api.use("/api/pages", requireAuth);
api.use("/api/pages/*", requireAuth);
api.use("/api/jobs", requireAuth);
api.use("/api/campaigns", requireAuth);
api.use("/api/leads/:id/status", requireAuth);
api.use("/api/leads/export", requireAuth);
api.use("/api/org/*", requireOwner);

// ── POST /api/upload ──
api.post("/api/upload", async (c) => {
  const org = c.get("org");
  const formData = await c.req.formData();
  const file = formData.get("video") as File | null;
  if (!file) return c.json({ error: "No video file" }, 400);
  if (file.size > 50 * 1024 * 1024) return c.json({ error: "Max 50 MB" }, 400);
  const ext = file.name?.split(".").pop()?.toLowerCase() || "mp4";
  const key = `org/${org.slug}/videos/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await c.env.VIDEO_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "video/mp4" },
  });
  return c.json({ key });
});

// ── POST /api/upload-photo ──
api.post("/api/upload-photo", async (c) => {
  const org = c.get("org");
  const formData = await c.req.formData();
  const file = formData.get("photo") as File | null;
  if (!file) return c.json({ error: "No photo file" }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ error: "Max 5 MB" }, 400);
  const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return c.json({ error: "JPG, PNG, or WebP only" }, 400);
  const key = `org/${org.slug}/photos/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await c.env.VIDEO_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "image/jpeg" },
  });
  return c.json({ key });
});

// ── GET /api/video/* — public (videos are served by slug lookup, not by key auth) ──
api.get("/api/video/*", async (c) => {
  const key = c.req.path.replace("/api/video/", "");

  // Block access to videos whose parent pages have expired
  if (key.startsWith("org/")) {
    const sql = getDb(c.env);
    const rows = await sql`
      SELECT expires_at, video_deleted_at FROM landing_pages
      WHERE video_key = ${key} LIMIT 1
    `;
    if (rows.length) {
      const r: any = rows[0];
      if (r.video_deleted_at || (r.expires_at && new Date(r.expires_at).getTime() < Date.now())) {
        return c.text("Not found", 404);
      }
    }
  }

  const object = await c.env.VIDEO_BUCKET.get(key);
  if (!object) return c.text("Not found", 404);

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "video/mp4");
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("Accept-Ranges", "bytes");

  const range = c.req.header("range");
  if (range && object.size) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : object.size - 1;
    const chunkSize = end - start + 1;
    const sliced = await c.env.VIDEO_BUCKET.get(key, { range: { offset: start, length: chunkSize } });
    if (!sliced) return c.text("Range not satisfiable", 416);
    headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);
    headers.set("Content-Length", String(chunkSize));
    return new Response(sliced.body, { status: 206, headers });
  }
  if (object.size) headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
});

// ── POST /api/pages ──
api.post("/api/pages", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const user = c.get("user");
  const body = await c.req.json();
  const { video_key, street_name, job_id, campaign_id, rep_name, rep_note, photo_keys } = body;
  if (!video_key || !street_name) return c.json({ error: "video_key and street_name required" }, 400);

  // Validate photo_keys: array of strings, max 6
  const photos: string[] = Array.isArray(photo_keys) ? photo_keys.filter((k: any) => typeof k === "string").slice(0, 6) : [];

  const baseSlug = street_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = crypto.randomUUID().slice(0, 6);
  const slug = `${baseSlug}-${suffix}`;

  const rows = await sql`
    INSERT INTO landing_pages (organization_id, slug, video_key, street_name, job_id, campaign_id, rep_name, rep_note, created_by_user_id, photos, expires_at)
    VALUES (${org.id}, ${slug}, ${video_key}, ${street_name}, ${job_id || null}, ${campaign_id || null}, ${rep_name || null}, ${rep_note || null}, ${user.id}, ${JSON.stringify(photos)}, now() + INTERVAL '14 days')
    RETURNING slug
  `;
  return c.json({ slug: rows[0].slug });
});

api.post("/api/pages/:id/toggle", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const id = c.req.param("id");
  await sql`UPDATE landing_pages SET is_active = NOT is_active WHERE id = ${id} AND organization_id = ${org.id}`;
  return c.redirect("/admin");
});

// ── POST /api/leads — PUBLIC endpoint, org resolved via page ──
api.post("/api/leads", async (c) => {
  const sql = getDb(c.env);
  const body = await c.req.json();
  const { page_id, name, phone, email, project_note } = body;
  if (!page_id || !name || !phone) return c.json({ error: "page_id, name, phone required" }, 400);

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return c.json({ error: "Invalid phone" }, 400);

  // Resolve org from page
  const pageRows = await sql`
    SELECT id, organization_id, street_name, rep_name, expires_at, video_deleted_at
    FROM landing_pages WHERE id = ${page_id} LIMIT 1
  `;
  if (!pageRows.length) return c.json({ error: "Page not found" }, 404);
  const page: any = pageRows[0];
  if (page.video_deleted_at || (page.expires_at && new Date(page.expires_at).getTime() < Date.now())) {
    return c.json({ error: "Page expired" }, 410);
  }

  const recent = await sql`
    SELECT COUNT(*) as cnt FROM leads
    WHERE page_id = ${page_id} AND phone = ${phone}
    AND created_at > now() - interval '1 hour'
  `;
  if (Number(recent[0].cnt) >= 3) return c.json({ error: "Too many submissions" }, 429);

  // Per-org abuse guard: cap at 200 leads/hour across the whole org.
  // A legit org submitting more than that in an hour should call us anyway.
  const orgRecent = await sql`
    SELECT COUNT(*) as cnt FROM leads
    WHERE organization_id = ${page.organization_id}
    AND created_at > now() - interval '1 hour'
  `;
  if (Number(orgRecent[0].cnt) >= 200) {
    return c.json({ error: "Rate limit — please try again shortly" }, 429);
  }

  // Per-IP burst guard: cap at 10 distinct submissions per IP per hour across any org.
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "";
  if (ip) {
    const ipRecent = await sql`
      SELECT COUNT(*) as cnt FROM page_events
      WHERE event_type = 'form_submit'
      AND metadata->>'ip' = ${ip}
      AND created_at > now() - interval '1 hour'
    `;
    if (Number(ipRecent[0].cnt) >= 10) {
      return c.json({ error: "Too many submissions from this network" }, 429);
    }
  }

  await sql`
    INSERT INTO leads (organization_id, page_id, name, phone, email, project_note)
    VALUES (${page.organization_id}, ${page_id}, ${name}, ${phone}, ${email || null}, ${project_note || null})
  `;
  await sql`INSERT INTO page_events (organization_id, page_id, event_type, metadata) VALUES (${page.organization_id}, ${page_id}, 'form_submit', ${JSON.stringify({ ip })})`;

  // Load org for email
  const orgRows = await sql`
    SELECT slug, display_name, reply_to_email, notify_email, sending_mode, custom_sending_domain, custom_sending_verified
    FROM organizations WHERE id = ${page.organization_id} LIMIT 1
  `;
  if (orgRows.length) {
    const org: any = orgRows[0];
    c.executionCtx.waitUntil(sendLeadNotification(c.env, org, { name, phone, email, project_note, streetName: page.street_name, repName: page.rep_name }));
  }
  return c.json({ ok: true });
});

// ── POST /api/leads/:id/status ──
api.post("/api/leads/:id/status", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const id = c.req.param("id");
  const formData = await c.req.formData();
  const status = formData.get("status") as string;
  const jobValueStr = formData.get("job_value") as string;
  const jobValue = jobValueStr ? parseInt(jobValueStr, 10) : null;

  if (!["new","contacted","quoted","won","lost"].includes(status)) return c.redirect("/admin/leads");

  if (status === "contacted") await sql`UPDATE leads SET status = ${status}, contacted_at = now() WHERE id = ${id} AND organization_id = ${org.id}`;
  else if (status === "quoted") await sql`UPDATE leads SET status = ${status}, quoted_at = now() WHERE id = ${id} AND organization_id = ${org.id}`;
  else if (status === "won") await sql`UPDATE leads SET status = ${status}, closed_at = now(), job_value = ${jobValue} WHERE id = ${id} AND organization_id = ${org.id}`;
  else if (status === "lost") await sql`UPDATE leads SET status = ${status}, closed_at = now() WHERE id = ${id} AND organization_id = ${org.id}`;
  else await sql`UPDATE leads SET status = ${status} WHERE id = ${id} AND organization_id = ${org.id}`;

  return c.redirect("/admin/leads");
});

// ── GET /api/leads/export — CSV download ──
api.get("/api/leads/export", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");

  const leads = await sql`
    SELECT l.name, l.phone, l.email, l.project_note, l.status,
           l.created_at, l.contacted_at, l.quoted_at, l.closed_at, l.job_value,
           lp.street_name, lp.slug as page_slug, lp.rep_name,
           c.name as campaign_name
    FROM leads l
    JOIN landing_pages lp ON l.page_id = lp.id
    LEFT JOIN campaigns c ON lp.campaign_id = c.id
    WHERE l.organization_id = ${org.id}
    ORDER BY l.created_at DESC
  `;

  function csvEsc(val: any): string {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const header = "Name,Phone,Email,Project Note,Status,Street,Rep,Campaign,Created,Contacted,Quoted,Closed,Job Value";
  const rows = leads.map((l: any) =>
    [l.name, l.phone, l.email, l.project_note, l.status, l.street_name, l.rep_name, l.campaign_name,
     l.created_at, l.contacted_at, l.quoted_at, l.closed_at, l.job_value].map(csvEsc).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
    },
  });
});

// ── POST /api/events — PUBLIC ──
api.post("/api/events", async (c) => {
  try {
    const body = await c.req.json();
    const { page_id, event_type } = body;
    if (!page_id || !event_type) return c.json({ ok: false }, 400);
    if (!["page_view","video_play","video_complete","form_start","form_submit","call_tap","cta_click"].includes(event_type)) return c.json({ ok: false }, 400);
    const sql = getDb(c.env);
    const pageRows = await sql`SELECT organization_id FROM landing_pages WHERE id = ${page_id} LIMIT 1`;
    if (pageRows.length) {
      const orgId = pageRows[0].organization_id;
      c.executionCtx.waitUntil(sql`INSERT INTO page_events (organization_id, page_id, event_type) VALUES (${orgId}, ${page_id}, ${event_type})`.then(() => {}));
    }
    return c.json({ ok: true });
  } catch { return c.json({ ok: true }); }
});

// ── POST /api/jobs ──
api.post("/api/jobs", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const formData = await c.req.formData();
  const address = formData.get("address") as string;
  const neighborhood = formData.get("neighborhood") as string;
  if (!address) return c.redirect("/admin/jobs");
  await sql`INSERT INTO active_jobs (organization_id, address, neighborhood) VALUES (${org.id}, ${address}, ${neighborhood || null})`;
  return c.redirect("/admin/jobs");
});

// ── POST /api/campaigns ──
api.post("/api/campaigns", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const formData = await c.req.formData();
  const name = formData.get("name") as string;
  const neighborhood = formData.get("neighborhood") as string;
  const job_id = formData.get("job_id") as string;
  if (!name) return c.redirect("/admin/campaigns");
  await sql`INSERT INTO campaigns (organization_id, name, neighborhood, job_id) VALUES (${org.id}, ${name}, ${neighborhood || null}, ${job_id || null})`;
  return c.redirect("/admin/campaigns");
});

// ── POST /api/org/profile (owner-only) ──
api.post("/api/org/profile", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const form = await c.req.parseBody();
  const display_name = String(form.display_name || org.display_name);
  const reply_to_email = String(form.reply_to_email || org.reply_to_email);
  const notify_email = String(form.notify_email || org.notify_email);
  await sql`UPDATE organizations SET display_name = ${display_name}, reply_to_email = ${reply_to_email}, notify_email = ${notify_email}, updated_at = now() WHERE id = ${org.id}`;
  return c.redirect("/admin/settings");
});

// ── POST /api/org/branding (owner-only) ──
api.post("/api/org/branding", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const body = await c.req.json();
  const { logo_key, brand_color, tagline, phone, website, service_areas, services } = body;

  // Parse services from comma-separated string into JSON array
  const servicesArr: string[] = services
    ? String(services).split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];

  await sql`
    UPDATE organizations SET
      logo_key = ${logo_key || null},
      brand_color = ${brand_color || null},
      tagline = ${tagline || null},
      phone = ${phone || null},
      website = ${website || null},
      service_areas = ${service_areas || null},
      services = ${JSON.stringify(servicesArr)},
      updated_at = now()
    WHERE id = ${org.id}
  `;
  return c.json({ ok: true });
});

// ── POST /api/org/landing-domain (owner-only) ──
api.post("/api/org/landing-domain", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const form = await c.req.parseBody();
  const domain = String(form.domain || "").trim().toLowerCase();
  if (!domain.match(/^[a-z0-9.-]+\.[a-z]{2,}$/)) return c.redirect("/admin/settings/landing-domain?error=invalid");

  let hostnameId: string | null = null;
  // If CF for SaaS is configured, register the custom hostname
  if (c.env.CF_API_TOKEN && c.env.CF_ZONE_ID) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${c.env.CF_ZONE_ID}/custom_hostnames`, {
        method: "POST",
        headers: { Authorization: `Bearer ${c.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: domain,
          ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
        }),
      });
      const json: any = await res.json();
      if (res.ok && json?.result?.id) hostnameId = json.result.id;
    } catch { /* ignore; user can retry */ }
  }

  await sql`
    UPDATE organizations
    SET custom_landing_domain = ${domain},
        custom_landing_verified = false,
        custom_landing_hostname_id = ${hostnameId},
        updated_at = now()
    WHERE id = ${org.id}
  `;
  return c.redirect("/admin/settings/landing-domain");
});

// ── POST /api/checkout — creates Stripe Checkout session (unchanged, but also sets org metadata) ──
api.post("/api/checkout", async (c) => {
  const body = await c.req.json();
  const { plan, email, company, extra_reps } = body;

  // If the user is authed, pass the org_id so the webhook can link back
  const s = await resolveSession(c);
  const orgId = s?.org?.id || "";

  const isAnnual = plan === "annual";
  const basePriceId = isAnnual ? "price_1TKrxkJrZj3GjsZe9bxSJlht" : "price_1TKrxLJrZj3GjsZeAYepp5Vw";
  const addonPriceId = isAnnual ? "price_1TKs70JrZj3GjsZeW4mQ1Lcp" : "price_1TKs63JrZj3GjsZeoe1DD0M4";
  const planLabel = isAnnual ? "Annual" : "Monthly";
  const repCount = Math.max(0, Math.min(50, parseInt(extra_reps) || 0));

  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": basePriceId,
    "line_items[0][quantity]": "1",
    success_url: `${c.env.SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.env.SITE_URL}/checkout`,
    ...(email ? { customer_email: email } : {}),
    "metadata[company]": company || "",
    "metadata[plan]": planLabel,
    "metadata[extra_reps]": String(repCount),
    "metadata[organization_id]": orgId,
    "subscription_data[metadata][company]": company || "",
    "subscription_data[metadata][plan]": planLabel,
    "subscription_data[metadata][extra_reps]": String(repCount),
    "subscription_data[metadata][organization_id]": orgId,
  });
  if (repCount > 0) {
    params.set("line_items[1][price]", addonPriceId);
    params.set("line_items[1][quantity]", String(repCount));
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const session = await res.json() as { url?: string; error?: { message: string } };
  if (!res.ok || !session.url) return c.json({ error: session.error?.message || "Failed" }, 500);
  return c.json({ url: session.url });
});

// ── POST /api/org/sending-domain — owner: create custom sending domain in Resend ──
api.post("/api/org/sending-domain", async (c) => {
  const org = c.get("org");
  const sql = getDb(c.env);
  const form = await c.req.formData();
  const domain = String(form.get("domain") || "").trim().toLowerCase();
  // Very loose validation — Resend will reject anything malformed
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return c.text("Invalid domain", 400);
  }

  // If an existing Resend domain exists on this org, clean it up first
  const cur = await sql`SELECT resend_domain_id FROM organizations WHERE id = ${org.id}`;
  const existingId = cur[0]?.resend_domain_id as string | null;
  if (existingId) {
    try { await resendDeleteDomain(c.env, existingId); } catch {}
  }

  let created;
  try {
    created = await resendCreateDomain(c.env, domain);
  } catch (err: any) {
    return c.text(err.message || "Resend error", 502);
  }

  await sql`
    UPDATE organizations
    SET custom_sending_domain = ${domain},
        custom_sending_verified = false,
        resend_domain_id = ${created.id},
        sending_domain_records = ${JSON.stringify(created.records || [])},
        sending_mode = 'shared',  -- keep on shared until verified
        updated_at = now()
    WHERE id = ${org.id}
  `;
  const user = c.get("user");
  await writeAudit(c.env, c, {
    actorUserId: user.id, actorEmail: user.email, organizationId: org.id,
    action: "sending_domain.create", targetKind: "organization", targetId: org.id,
    metadata: { domain, resend_domain_id: created.id },
  });
  return c.redirect("/admin/settings/sending-domain");
});

// ── POST /api/org/sending-domain/verify — owner: ask Resend to re-check DNS ──
api.post("/api/org/sending-domain/verify", async (c) => {
  const org = c.get("org");
  const sql = getDb(c.env);
  const rows = await sql`SELECT resend_domain_id FROM organizations WHERE id = ${org.id}`;
  const id = rows[0]?.resend_domain_id as string | null;
  if (!id) return c.text("No sending domain configured", 400);

  try {
    await resendVerifyDomain(c.env, id);
  } catch {
    // verify request may return an error even when the domain is still healthy;
    // we still pull status below.
  }
  let domainStatus;
  try {
    domainStatus = await resendGetDomain(c.env, id);
  } catch (err: any) {
    return c.text(err.message || "Resend error", 502);
  }

  const verified = domainStatus.status === "verified";
  await sql`
    UPDATE organizations
    SET custom_sending_verified = ${verified},
        sending_mode = ${verified ? "custom" : "shared"},
        sending_domain_records = ${JSON.stringify(domainStatus.records || [])},
        updated_at = now()
    WHERE id = ${org.id}
  `;
  const user = c.get("user");
  await writeAudit(c.env, c, {
    actorUserId: user.id, actorEmail: user.email, organizationId: org.id,
    action: "sending_domain.verify", targetKind: "organization", targetId: org.id,
    metadata: { resend_status: domainStatus.status, verified },
  });
  return c.redirect("/admin/settings/sending-domain");
});

// ── POST /api/org/sending-domain/remove — owner: revert to shared ──
api.post("/api/org/sending-domain/remove", async (c) => {
  const org = c.get("org");
  const sql = getDb(c.env);
  const rows = await sql`SELECT resend_domain_id FROM organizations WHERE id = ${org.id}`;
  const id = rows[0]?.resend_domain_id as string | null;
  if (id) {
    try { await resendDeleteDomain(c.env, id); } catch {}
  }
  await sql`
    UPDATE organizations
    SET custom_sending_domain = NULL,
        custom_sending_verified = false,
        resend_domain_id = NULL,
        sending_domain_records = NULL,
        sending_mode = 'shared',
        updated_at = now()
    WHERE id = ${org.id}
  `;
  const user = c.get("user");
  await writeAudit(c.env, c, {
    actorUserId: user.id, actorEmail: user.email, organizationId: org.id,
    action: "sending_domain.remove", targetKind: "organization", targetId: org.id,
  });
  return c.redirect("/admin/settings");
});

// ── POST /api/org/billing-portal — owner-only: redirect to Stripe Billing Portal ──
api.post("/api/org/billing-portal", async (c) => {
  const org = c.get("org");
  if (!org.stripe_customer_id) {
    return c.json({ error: "No Stripe customer on file. Start a subscription first." }, 400);
  }
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Billing not configured" }, 500);
  }
  const params = new URLSearchParams();
  params.set("customer", org.stripe_customer_id);
  params.set("return_url", `${c.env.SITE_URL}/admin/settings`);
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const session = await res.json() as { url?: string; error?: { message: string } };
  if (!res.ok || !session.url) return c.json({ error: session.error?.message || "Failed" }, 500);
  return c.redirect(session.url);
});

// ── POST /api/hardware/checkout — create Stripe Checkout session for printer bundle ──
api.post("/api/hardware/checkout", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid request" }, 400); }

  const trialId = (body.trial_id || "").toString().trim();
  const qty = Math.max(1, Math.min(10, parseInt(body.qty || "1", 10)));

  if (!trialId || !/^[0-9a-f-]{36}$/i.test(trialId)) {
    return c.json({ error: "Invalid trial ID" }, 400);
  }
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Stripe not configured" }, 500);
  }

  const siteUrl = c.env.SITE_URL || "https://knoqgen.com";
  const unitCents = 9900; // $99.00
  const PRINTER_BUNDLE_PRODUCT_ID = "prod_ULcagqfzPkJ6BX";

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("payment_method_types[0]", "card");
  // Use the existing Stripe product so its name, description, and images show on checkout
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(unitCents));
  params.set("line_items[0][price_data][product]", PRINTER_BUNDLE_PRODUCT_ID);
  params.set("line_items[0][quantity]", String(qty));
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("metadata[type]", "hardware");
  params.set("metadata[trial_id]", trialId);
  params.set("metadata[qty]", String(qty));
  params.set("metadata[sku]", "printer-bundle-v1");
  params.set("success_url", `${siteUrl}/trial/setup?id=${encodeURIComponent(trialId)}&bundle=1`);
  params.set("cancel_url", `${siteUrl}/trial/setup?id=${encodeURIComponent(trialId)}`);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const session = await res.json() as { id?: string; url?: string; error?: { message: string } };
  if (!res.ok || !session.url) {
    return c.json({ error: session.error?.message || "Failed to create checkout session" }, 500);
  }
  return c.json({ ok: true, url: session.url, session_id: session.id });
});

// ── POST /api/stripe/webhook — syncs subscription state onto org ──
api.post("/api/stripe/webhook", async (c) => {
  // Note: signature verification is required for production. Cloudflare Workers doesn't
  // bundle stripe-sdk well; we do a lightweight HMAC check if STRIPE_WEBHOOK_SECRET is set.
  const rawBody = await c.req.text();
  const sigHeader = c.req.header("stripe-signature") || "";
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (secret) {
    const ok = await verifyStripeSig(rawBody, sigHeader, secret);
    if (!ok) return c.text("bad sig", 400);
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return c.text("bad body", 400); }

  const sql = getDb(c.env);

  async function applyToOrg(orgId: string, fields: Record<string, any>) {
    const sets: string[] = [];
    const values: any[] = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = $${values.length + 1}`);
      values.push(v);
    }
    if (!sets.length) return;
    values.push(orgId);
    // Neon template-tag only — rebuild with individual fields
    await sql`
      UPDATE organizations SET
        stripe_customer_id = COALESCE(${fields.stripe_customer_id ?? null}, stripe_customer_id),
        stripe_subscription_id = COALESCE(${fields.stripe_subscription_id ?? null}, stripe_subscription_id),
        plan = COALESCE(${fields.plan ?? null}, plan),
        billing_status = COALESCE(${fields.billing_status ?? null}, billing_status),
        current_period_end = COALESCE(${fields.current_period_end ?? null}, current_period_end),
        status = COALESCE(${fields.status ?? null}, status),
        updated_at = now()
      WHERE id = ${orgId}
    `;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        // Hardware bundle order — save to hardware_orders
        if (pi.metadata?.type === "hardware") {
          const trialId = pi.metadata?.trial_id || null;
          const orderQty = parseInt(pi.metadata?.qty || "1", 10);
          const unitCents = 9900;
          const shipAddr = pi.shipping?.address ?? {};
          await sql`
            INSERT INTO hardware_orders (
              trial_signup_id, product_sku, product_name,
              qty, unit_price_cents, total_cents,
              stripe_payment_intent_id, stripe_payment_status,
              shipping_name, shipping_email, shipping_address
            ) VALUES (
              ${trialId}::UUID, 'printer-bundle-v1', 'Leave-Behind System',
              ${orderQty}, ${unitCents}, ${orderQty * unitCents},
              ${pi.id}, 'paid',
              ${pi.shipping?.name || pi.metadata?.shipping_name || null},
              ${pi.receipt_email || pi.metadata?.shipping_email || null},
              ${JSON.stringify(shipAddr)}::JSONB
            )
            ON CONFLICT (stripe_payment_intent_id) DO NOTHING
          `;
        }
        break;
      }

      case "checkout.session.completed": {
        const sess = event.data.object;
        // Software subscription only (hardware orders now use payment_intent.succeeded)
        const orgId = sess.metadata?.organization_id;
        if (orgId) {
          await applyToOrg(orgId, {
            stripe_customer_id: sess.customer,
            stripe_subscription_id: sess.subscription,
            plan: sess.metadata?.plan?.toLowerCase() || null,
            billing_status: "active",
            status: "active",
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object;
        const orgId = sub.metadata?.organization_id;
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        if (orgId) {
          await applyToOrg(orgId, {
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            billing_status: sub.status,
            current_period_end: periodEnd,
            status: sub.status === "active" || sub.status === "trialing" ? "active" : (sub.status === "past_due" ? "suspended" : null),
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const orgId = sub.metadata?.organization_id;
        if (orgId) {
          await applyToOrg(orgId, {
            billing_status: "canceled",
            status: "canceled",
          });
        }
        break;
      }
    }
  } catch (e) {
    console.error("stripe webhook error", e);
    return c.text("error", 500);
  }
  return c.json({ received: true });
});

// Stripe signature verification (HMAC-SHA256)
async function verifyStripeSig(body: string, header: string, secret: string): Promise<boolean> {
  // header format: t=<ts>,v1=<sig>,...
  const parts = header.split(",").reduce((m: any, p) => {
    const [k, v] = p.split("=", 2); m[k] = v; return m;
  }, {});
  if (!parts.t || !parts.v1) return false;
  const signedPayload = `${parts.t}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  // constant-time
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

// ── Lead email notification ──
async function sendLeadNotification(
  env: Env,
  org: any,
  lead: { name: string; phone: string; email: string | null; project_note: string | null; streetName: string; repName: string | null },
) {
  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
      <h2 style="margin-bottom:4px">New Quote Request</h2>
      <p style="color:#888;font-size:14px;margin-bottom:20px">Someone scanned your QR code.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr><td style="padding:8px 0;color:#888;width:120px">Name</td><td style="padding:8px 0;font-weight:600">${lead.name}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Phone</td><td><a href="tel:${lead.phone}" style="color:#8145FC;font-weight:600">${lead.phone}</a></td></tr>
        ${lead.email ? `<tr><td style="padding:8px 0;color:#888">Email</td><td>${lead.email}</td></tr>` : ""}
        ${lead.project_note ? `<tr><td style="padding:8px 0;color:#888">Project</td><td>${lead.project_note}</td></tr>` : ""}
        <tr><td style="padding:8px 0;color:#888">Source</td><td>${lead.streetName}${lead.repName ? ` (${lead.repName})` : ""}</td></tr>
      </table>
      <div style="margin-top:20px">
        <a href="tel:${lead.phone}" style="display:inline-block;padding:10px 24px;background:#8145FC;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Call ${lead.name.split(' ')[0]} Now</a>
      </div>
      <p style="margin-top:20px;font-size:13px;color:#888">${org.display_name} &middot; <a href="${orgBaseUrl(org.slug, env.SITE_URL)}/admin/leads">View all leads</a></p>
    </div>`;
  await sendOrgEmail(env, org, {
    to: [org.notify_email],
    subject: `New Quote Request — ${lead.streetName}`,
    html: htmlBody,
  });
}

export default api;
