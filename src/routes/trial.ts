import { Hono } from "hono";
import type { Env } from "../lib/db";
import { getDb } from "../lib/db";

const trial = new Hono<{ Bindings: Env }>();

// ── GET /trial — Free-trial signup page (no CC) ──
trial.get("/trial", (c) => {
  return c.html(trialPage());
});

// ── POST /api/trial — Create a trial signup ──
trial.post("/api/trial", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }

  const email = (body.email || "").toString().trim().toLowerCase();
  const name = (body.name || "").toString().trim();
  const company = (body.company || "").toString().trim();
  const phone = (body.phone || "").toString().trim();
  const teamSize = (body.team_size || "").toString().trim();
  const source = (body.source || "").toString().trim() || null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: "Please enter a valid email" }, 400);
  }
  if (!name) return c.json({ error: "Name is required" }, 400);
  if (!company) return c.json({ error: "Company is required" }, 400);

  // Store in DB (best-effort — don't block the response on DB failures)
  let trialId: string | null = null;
  try {
    const sql = getDb(c.env);
    const rows = await sql`
      INSERT INTO trial_signups (email, name, company, phone, team_size, source, status)
      VALUES (${email}, ${name}, ${company}, ${phone || null}, ${teamSize || null}, ${source}, 'pending')
      RETURNING id, trial_ends_at
    ` as Array<{ id: string; trial_ends_at: string }>;
    trialId = rows[0]?.id ?? null;
  } catch (err) {
    console.error("trial_signups insert failed", err);
  }

  // Send the emails inline so failures surface in the response + logs.
  // (Previously fire-and-forget via waitUntil — which hid Resend errors.)
  const emailResult = await sendTrialEmails(c.env, {
    email, name, company, phone, teamSize, trialId,
  });

  return c.json({ ok: true, id: trialId, email: emailResult });
});

// ── GET /trial/setup — Step 2 intake form ──
trial.get("/trial/setup", async (c) => {
  const id = c.req.query("id") || "";
  if (!id) return c.redirect("/trial");

  // Verify the trial exists + fetch name/company for pre-fill
  try {
    const sql = getDb(c.env);
    const rows = await sql`SELECT id, name, company, intake_completed_at FROM trial_signups WHERE id = ${id}` as Array<{
      id: string; name: string | null; company: string | null; intake_completed_at: string | null;
    }>;
    if (rows.length === 0) return c.redirect("/trial");
    const row = rows[0];
    if (row.intake_completed_at) return c.redirect("/trial/success?done=1");
    return c.html(trialSetupPage(row.id, row.name || "", row.company || ""));
  } catch {
    return c.redirect("/trial");
  }
});

// ── POST /api/trial/upload — Public, scoped-by-id asset upload ──
// Accepts a multipart form with `id`, `kind` ('logo'|'video'|'photo'), `file`.
// Writes to R2 under trial-intake/<id>/<kind>-<timestamp>.<ext>
trial.post("/api/trial/upload", async (c) => {
  const form = await c.req.formData();
  const id = (form.get("id") || "").toString();
  const kind = (form.get("kind") || "").toString();
  const file = form.get("file") as File | null;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Invalid trial id" }, 400);
  if (!["logo", "video", "photo"].includes(kind)) return c.json({ error: "Invalid kind" }, 400);
  if (!file) return c.json({ error: "No file provided" }, 400);

  // Verify the trial exists
  try {
    const sql = getDb(c.env);
    const rows = await sql`SELECT id FROM trial_signups WHERE id = ${id}` as Array<{ id: string }>;
    if (rows.length === 0) return c.json({ error: "Trial not found" }, 404);
  } catch (err) {
    console.error("trial lookup failed", err);
    return c.json({ error: "Server error" }, 500);
  }

  // Enforce reasonable size + type caps per kind
  const caps: Record<string, { max: number; prefixes: string[] }> = {
    logo:  { max: 10  * 1024 * 1024, prefixes: ["image/"] },
    photo: { max: 15  * 1024 * 1024, prefixes: ["image/"] },
    video: { max: 100 * 1024 * 1024, prefixes: ["video/"] },
  };
  const cap = caps[kind];
  if (file.size > cap.max) return c.json({ error: `File too large. Max ${Math.round(cap.max / 1024 / 1024)} MB.` }, 400);
  if (!cap.prefixes.some(p => (file.type || "").startsWith(p))) {
    return c.json({ error: `Unsupported file type for ${kind}` }, 400);
  }

  const ext = (file.name?.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const key = `trial-intake/${id}/${kind}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await c.env.VIDEO_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  return c.json({
    ok: true,
    key,
    kind,
    url: `/api/video/${key}`,
    size: file.size,
    content_type: file.type,
    filename: file.name,
  });
});

// ── POST /api/trial/setup — Step 2 intake submit ──
trial.post("/api/trial/setup", async (c) => {
  let body: any;
  try { body = await c.req.json(); }
  catch { return c.json({ error: "Invalid request" }, 400); }

  const id = (body.id || "").toString();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Invalid trial id" }, 400);

  // Required intake fields
  const required = ["company_phone", "tagline", "rep_name", "test_address"];
  for (const f of required) {
    if (!body[f] || !body[f].toString().trim()) {
      return c.json({ error: `Missing required field: ${f}` }, 400);
    }
  }

  const intake = {
    company_phone: (body.company_phone || "").toString().trim(),
    tagline: (body.tagline || "").toString().trim(),
    services: Array.isArray(body.services) ? body.services.map((s: any) => s.toString()).slice(0, 20) : [],
    service_areas: (body.service_areas || "").toString().trim(),
    primary_color: (body.primary_color || "").toString().trim() || null,
    rep_name: (body.rep_name || "").toString().trim(),
    rep_phone: (body.rep_phone || "").toString().trim(),
    rep_email: (body.rep_email || "").toString().trim().toLowerCase(),
    test_address: (body.test_address || "").toString().trim(),
    video_script: (body.video_script || "").toString().trim(),
    website: (body.website || "").toString().trim(),
    additional_notes: (body.additional_notes || "").toString().trim(),
    need_us_to_record_video: Boolean(body.need_us_to_record_video),
  };

  const assets = Array.isArray(body.assets) ? body.assets.slice(0, 20) : [];

  // Must supply a video script if they didn't upload a video
  const hasVideo = assets.some((a: any) => a && a.kind === "video");
  if (!hasVideo && !intake.video_script) {
    return c.json({ error: "Please either upload a video or write out what you'd like the video to say." }, 400);
  }

  try {
    const sql = getDb(c.env);
    const rows = await sql`
      UPDATE trial_signups
      SET intake = ${JSON.stringify(intake)}::jsonb,
          assets = ${JSON.stringify(assets)}::jsonb,
          intake_completed_at = now(),
          status = 'active'
      WHERE id = ${id}
      RETURNING id, email, name, company
    ` as Array<{ id: string; email: string; name: string; company: string }>;
    if (rows.length === 0) return c.json({ error: "Trial not found" }, 404);

    // Email the full packet to the team
    c.executionCtx.waitUntil(sendIntakePacket(c.env, rows[0], intake, assets));

    return c.json({ ok: true });
  } catch (err) {
    console.error("intake save failed", err);
    return c.json({ error: "Could not save intake. Try again in a minute." }, 500);
  }
});

// ── GET /api/trial/diagnose — quick config check ──
// Hit this in a browser when emails aren't arriving to see what's wrong.
trial.get("/api/trial/diagnose", (c) => {
  return c.json({
    has_resend_key: Boolean(c.env.RESEND_API_KEY),
    resend_key_prefix: c.env.RESEND_API_KEY ? c.env.RESEND_API_KEY.slice(0, 6) + "…" : null,
    notify_email_env: c.env.NOTIFY_EMAIL || null,
    trial_notify_to: "hello@knoqgen.com",
    from_domain: "estimate.knoqgen.com",
    note: "The from-domain must be verified in Resend. If has_resend_key is false, set it: npx wrangler secret put RESEND_API_KEY",
  });
});

// ── GET /trial/success — Thank-you page ──
trial.get("/trial/success", (c) => {
  return c.html(trialSuccessPage());
});

// ── Email helpers ──
async function sendTrialEmails(
  env: Env,
  payload: { email: string; name: string; company: string; phone: string; teamSize: string; trialId: string | null }
): Promise<{ notify: EmailResult; welcome: EmailResult; skipped?: string }> {
  if (!env.RESEND_API_KEY) {
    const reason = "RESEND_API_KEY not set on deployed Worker — run: npx wrangler secret put RESEND_API_KEY";
    console.error(reason);
    return { notify: { ok: false, error: reason }, welcome: { ok: false, error: reason }, skipped: reason };
  }

  const endsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const endsStr = endsAt.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const TRIAL_NOTIFY = "hello@knoqgen.com";

  // 1) Notify the team
  const notifyHtml = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px">
      <h2 style="color:#8145FC;margin:0 0 12px">New Free Trial Signup</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#888;width:100px">Name</td><td><strong>${esc(payload.name)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#888">Company</td><td><strong>${esc(payload.company)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#888">Email</td><td><a href="mailto:${esc(payload.email)}">${esc(payload.email)}</a></td></tr>
        ${payload.phone ? `<tr><td style="padding:6px 0;color:#888">Phone</td><td><a href="tel:${esc(payload.phone)}">${esc(payload.phone)}</a></td></tr>` : ""}
        ${payload.teamSize ? `<tr><td style="padding:6px 0;color:#888">Team size</td><td>${esc(payload.teamSize)}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#888">Trial ends</td><td>${esc(endsStr)}</td></tr>
      </table>
      <p style="margin-top:20px;font-size:14px;color:#555">They signed up for a free 14-day trial (no CC). Manually provision their account and reply with a login link.</p>
    </div>`;

  const notify = await sendResend(env.RESEND_API_KEY, {
    from: "KnoqGen <hello@estimate.knoqgen.com>",
    to: [TRIAL_NOTIFY],
    reply_to: payload.email,
    subject: `New Free Trial — ${payload.company}`,
    html: notifyHtml,
  });

  // 2) Welcome email to the prospect
  const welcomeHtml = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#333">
      <h2 style="color:#8145FC;margin:0 0 12px">Welcome to KnoqGen, ${esc(payload.name)}!</h2>
      <p>Your 14-day free trial is on its way. Here's what happens next:</p>
      <ol style="line-height:1.7;padding-left:20px">
        <li>I'll personally send you a login link within the next business day.</li>
        <li>Record your first video and generate a QR code in under 10 minutes.</li>
        <li>Your trial runs through <strong>${esc(endsStr)}</strong>. No credit card needed.</li>
      </ol>
      <p>No charge unless you decide to continue. Reply anytime if you have questions — I read every email.</p>
      <p style="margin-top:24px">— David<br><span style="color:#888;font-size:13px">Founder, KnoqGen</span></p>
    </div>`;

  const welcome = await sendResend(env.RESEND_API_KEY, {
    from: "David at KnoqGen <hello@estimate.knoqgen.com>",
    to: [payload.email],
    reply_to: TRIAL_NOTIFY,
    subject: "Your KnoqGen free trial is ready",
    html: welcomeHtml,
  });

  return { notify, welcome };
}

// ── Intake packet email (step 2 completed) ──
async function sendIntakePacket(
  env: Env,
  row: { id: string; email: string; name: string; company: string },
  intake: Record<string, any>,
  assets: Array<{ kind: string; key: string; url?: string; filename?: string; size?: number; content_type?: string }>
) {
  if (!env.RESEND_API_KEY) return;

  const siteBase = env.SITE_URL || "https://knoqgen.com";
  const servicesStr = (intake.services || []).join(", ") || "—";
  const assetList = assets.length === 0 ? "<em>No files uploaded.</em>" : assets.map(a => {
    const label = a.kind.charAt(0).toUpperCase() + a.kind.slice(1);
    const size = a.size ? ` (${Math.round(a.size / 1024)} KB)` : "";
    return `<li><strong>${esc(label)}:</strong> <a href="${siteBase}${esc(a.url || "/api/video/" + a.key)}">${esc(a.filename || a.key)}</a>${esc(size)}</li>`;
  }).join("");

  const videoBlock = assets.some(a => a.kind === "video")
    ? `<p style="color:#2e7d32"><strong>&#10003; Video uploaded.</strong></p>`
    : `<p style="color:#b45309"><strong>Video script (they want us to record):</strong></p>
       <blockquote style="margin:0;padding:12px 14px;background:#fef3c7;border-left:3px solid #d97706;border-radius:4px;font-size:14px;white-space:pre-wrap">${esc(intake.video_script || "—")}</blockquote>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;color:#333;line-height:1.5">
      <h2 style="color:#8145FC;margin:0 0 8px">Trial intake completed</h2>
      <p style="color:#888;margin:0 0 20px">From <strong>${esc(row.name)}</strong> at <strong>${esc(row.company)}</strong> &middot; <a href="mailto:${esc(row.email)}">${esc(row.email)}</a></p>

      <h3 style="margin:18px 0 6px;font-size:15px">Company</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 0;color:#888;width:140px">Phone</td><td><strong>${esc(intake.company_phone || "—")}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#888">Tagline</td><td>${esc(intake.tagline || "—")}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Website</td><td>${esc(intake.website || "—")}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Services</td><td>${esc(servicesStr)}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Service areas</td><td>${esc(intake.service_areas || "—")}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Primary color</td><td>${esc(intake.primary_color || "—")}</td></tr>
      </table>

      <h3 style="margin:18px 0 6px;font-size:15px">Primary rep</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 0;color:#888;width:140px">Name</td><td><strong>${esc(intake.rep_name || "—")}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#888">Phone</td><td>${esc(intake.rep_phone || "—")}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Email</td><td>${esc(intake.rep_email || "—")}</td></tr>
      </table>

      <h3 style="margin:18px 0 6px;font-size:15px">First landing page</h3>
      <p style="font-size:14px;margin:0"><strong>Test address:</strong> ${esc(intake.test_address || "—")}</p>

      <h3 style="margin:18px 0 6px;font-size:15px">Video</h3>
      ${videoBlock}

      <h3 style="margin:18px 0 6px;font-size:15px">Uploaded files</h3>
      <ul style="padding-left:20px;font-size:14px;margin:0">${assetList}</ul>

      ${intake.additional_notes ? `
      <h3 style="margin:18px 0 6px;font-size:15px">Additional notes</h3>
      <p style="font-size:14px;white-space:pre-wrap;margin:0">${esc(intake.additional_notes)}</p>` : ""}

      <hr style="margin:24px 0;border:none;border-top:1px solid #eee">
      <p style="font-size:13px;color:#888">Trial ID: ${esc(row.id)}</p>
    </div>`;

  await sendResend(env.RESEND_API_KEY, {
    from: "KnoqGen <hello@estimate.knoqgen.com>",
    to: ["hello@knoqgen.com"],
    reply_to: row.email,
    subject: `Intake complete — ${row.company}`,
    html,
  });
}

type EmailResult = { ok: boolean; status?: number; id?: string; error?: string };

async function sendResend(apiKey: string, body: Record<string, unknown>): Promise<EmailResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("Resend send failed", res.status, text, "payload:", JSON.stringify({ from: body.from, to: body.to, subject: body.subject }));
      return { ok: false, status: res.status, error: text.slice(0, 400) };
    }
    let id: string | undefined;
    try { id = JSON.parse(text).id; } catch {}
    console.log("Resend send ok", res.status, id, "to:", body.to);
    return { ok: true, status: res.status, id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Resend fetch error", msg);
    return { ok: false, error: msg };
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Page templates ──
function trialPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Start Your Free 14-Day Trial &mdash; KnoqGen</title>
  <meta name="description" content="Try KnoqGen free for 14 days. No credit card. Turn missed doors into leads with personalized video + QR drop cards.">
  <meta property="og:title" content="Start Your Free 14-Day Trial &mdash; KnoqGen">
  <meta property="og:description" content="14 days free. No credit card. Turn missed doors into leads.">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://knoqgen.com/og-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://knoqgen.com/og-card.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>${TRIAL_CSS}</style>
</head>
<body>

<header class="tr-header">
  <div class="tr-container">
    <a href="/sell" class="tr-logo"><img src="/logo.png" alt="KnoqGen" style="height:34px;width:auto"></a>
    <a href="/sell" class="tr-nav-link">&larr; Back</a>
  </div>
</header>

<main class="tr-main">
  <div class="tr-container">
    <div class="tr-layout">
      <!-- LEFT: pitch -->
      <div class="tr-pitch">
        <div class="tr-badge">Free for 14 days &middot; No credit card</div>
        <h1>Try KnoqGen free.<br>See your first lead in a week.</h1>
        <p class="tr-lede">Full access to the whole platform for 14 days. Every feature, every rep. If it doesn't pay for itself, walk away &mdash; no charge, no hassle.</p>

        <ul class="tr-checks">
          <li><span>&#10003;</span> <strong>No credit card required.</strong> Sign up and start knocking.</li>
          <li><span>&#10003;</span> <strong>Full access.</strong> Unlimited reps, landing pages, and leads during your trial.</li>
          <li><span>&#10003;</span> <strong>Cancel anytime.</strong> If it's not a fit, just let us know. Nothing is charged.</li>
          <li><span>&#10003;</span> <strong>Real support.</strong> David personally onboards every team.</li>
        </ul>

        <div class="tr-preview">
          <img src="/landing-hero-mobile.png" alt="Sample landing page" />
          <div class="tr-preview-caption">What a homeowner sees when they scan your QR &rarr; a personal video, your trust signals, one clear CTA.</div>
        </div>
      </div>

      <!-- RIGHT: form -->
      <aside class="tr-form-wrap">
        <div class="tr-form-card">
          <h2>Start your free trial</h2>
          <p class="tr-sub">Step 1 of 2. Quick 30-second form, then a short intake so we can build your account.</p>

          <form id="trialForm" novalidate>
            <div class="tr-field">
              <label for="name">Your name</label>
              <input id="name" name="name" type="text" required autocomplete="name" placeholder="Jane Smith">
            </div>
            <div class="tr-field">
              <label for="email">Work email</label>
              <input id="email" name="email" type="email" required autocomplete="email" placeholder="jane@yourcompany.com">
            </div>
            <div class="tr-field">
              <label for="company">Company name</label>
              <input id="company" name="company" type="text" required autocomplete="organization" placeholder="Your Painting Co.">
            </div>
            <div class="tr-field">
              <label for="phone">Phone <span class="tr-opt">(optional)</span></label>
              <input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="(555) 123-4567">
            </div>
            <div class="tr-field">
              <label for="team_size">How many reps? <span class="tr-opt">(optional)</span></label>
              <select id="team_size" name="team_size">
                <option value="">Select&hellip;</option>
                <option value="1">Just me</option>
                <option value="2-3">2-3 reps</option>
                <option value="4-10">4-10 reps</option>
                <option value="11+">11+ reps</option>
              </select>
            </div>

            <!-- Leave-Behind System upsell -->
            <div class="tr-bundle-wrap" id="bundleWrap">
              <div class="tr-bundle-header">
                <div class="tr-bundle-badge">⚡ ONE-TIME ADD-ON</div>
                <div class="tr-bundle-price-tag">$99</div>
              </div>
              <div class="tr-bundle-inner">
                <div class="tr-bundle-img-col">
                  <img src="/leave-behind-system.png" alt="Leave-Behind System" class="tr-bundle-img">
                </div>
                <div class="tr-bundle-content">
                  <div class="tr-bundle-title">Leave-Behind System</div>
                  <div class="tr-bundle-hook">Most doors don't answer.<br><strong>This one still gets you the lead.</strong></div>
                  <ul class="tr-bundle-list">
                    <li>Print a QR sticker in 10 sec &amp; walk away</li>
                    <li>Homeowner scans → watches your video → fills your form</li>
                    <li>500 stickers included &bull; No ink. Ever.</li>
                    <li>Zero setup — works with KnoqGen out of the box</li>
                  </ul>
                  <div class="tr-bundle-roi">One job covers this <strong>15× over.</strong></div>
                </div>
              </div>
              <label class="tr-bundle-cta-row">
                <input type="checkbox" id="bundleCheck" name="bundle">
                <span class="tr-bundle-cta-text">✅ Yes — Add the Leave-Behind System for <strong>$99</strong></span>
              </label>
              <div class="tr-bundle-qty" id="bundleQtyRow" style="display:none">
                <span class="tr-bundle-qty-label">Qty:</span>
                <div class="tr-qty-controls">
                  <button type="button" id="qtyMinus">&#8722;</button>
                  <span id="qtyDisplay">1</span>
                  <button type="button" id="qtyPlus">&#43;</button>
                </div>
                <span class="tr-bundle-total" id="bundleTotal">= $99</span>
              </div>
              <div class="tr-bundle-ships-note">🚚 Ships in 3–5 days &bull; 30-day satisfaction guarantee &bull; 1-year hardware warranty</div>
            </div>

            <button type="submit" id="submitBtn" class="tr-btn">
              Continue to Setup &rarr;
            </button>
            <p class="tr-fine">No credit card required for the trial. Leave-Behind System is a separate one-time charge via Stripe.</p>
            <div id="trialError" class="tr-error" style="display:none"></div>
          </form>
        </div>

        <div class="tr-trust">
          <div><strong>14 days free</strong><span>Full access, no CC</span></div>
          <div><strong>10 min setup</strong><span>Record, print, drop</span></div>
          <div><strong>$99/mo after</strong><span>Only if you love it</span></div>
        </div>
      </aside>
    </div>
  </div>
</main>

<footer class="tr-footer">
  &copy; ${new Date().getFullYear()} KnoqGen &middot; <a href="/sell">About</a> &middot; <a href="/checkout">See full pricing</a>
</footer>

<script>
(function(){
  var form = document.getElementById('trialForm');
  var btn = document.getElementById('submitBtn');
  var err = document.getElementById('trialError');
  var bundleCheck = document.getElementById('bundleCheck');
  var bundleQtyRow = document.getElementById('bundleQtyRow');
  var qtyDisplay = document.getElementById('qtyDisplay');
  var bundleTotal = document.getElementById('bundleTotal');
  var qty = 1;

  // Show/hide qty row when checkbox toggled
  bundleCheck.addEventListener('change', function(){
    bundleQtyRow.style.display = this.checked ? 'flex' : 'none';
    updateTotal();
  });

  // Qty controls
  document.getElementById('qtyMinus').addEventListener('click', function(){
    if(qty > 1){ qty--; updateQty(); }
  });
  document.getElementById('qtyPlus').addEventListener('click', function(){
    if(qty < 10){ qty++; updateQty(); }
  });

  function updateQty(){
    qtyDisplay.textContent = qty;
    updateTotal();
  }
  function updateTotal(){
    bundleTotal.textContent = '= $' + (99 * qty);
  }

  function showErr(msg){
    err.textContent = msg;
    err.style.display = 'block';
  }
  function clearErr(){ err.style.display = 'none'; err.textContent = ''; }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    clearErr();

    var body = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      company: document.getElementById('company').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      team_size: document.getElementById('team_size').value,
      source: (new URLSearchParams(location.search).get('utm_source')) || document.referrer || ''
    };

    if(!body.name || !body.email || !body.company){
      showErr('Please fill out name, email, and company.');
      return;
    }

    var wantBundle = bundleCheck.checked;
    btn.disabled = true;
    btn.textContent = wantBundle ? 'Preparing your order...' : 'Starting your trial...';

    // Step 1: create the trial signup
    fetch('/api/trial', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
    .then(function(res){
      if(!res.ok || !res.data.ok || !res.data.id){
        showErr(res.data.error || 'Something went wrong. Please try again.');
        btn.disabled = false;
        btn.textContent = wantBundle ? 'Preparing your order...' : 'Continue to Setup →';
        return;
      }

      var trialId = res.data.id;

      if(!wantBundle){
        // No bundle — go straight to intake
        window.location.href = '/trial/setup?id=' + encodeURIComponent(trialId);
        return;
      }

      // Bundle selected — go to branded order page
      window.location.href = '/hardware/order?trial_id=' + encodeURIComponent(trialId) + '&qty=' + qty;
    })
    .catch(function(){
      showErr('Connection error. Please try again.');
      btn.disabled = false;
      btn.textContent = wantBundle ? 'Preparing your order...' : 'Continue to Setup →';
    });
  });
})();
</script>

</body>
</html>`;
}

function trialSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Created &mdash; KnoqGen</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Heebo',sans-serif;background:#f5f7fa;color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
    .card{background:#fff;border-radius:16px;padding:48px 32px;max-width:520px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .check{width:72px;height:72px;background:#e8f5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
    h1{font-size:26px;font-weight:800;margin-bottom:8px;color:#2e7d32}
    .sub{font-size:16px;color:#555;line-height:1.6;margin-bottom:8px}
    .email-box{background:#f0f7ff;border:1px solid #d0e3f7;border-radius:12px;padding:20px 24px;margin:24px 0;text-align:center}
    .email-box .icon{font-size:32px;margin-bottom:8px}
    .email-box h3{font-size:16px;font-weight:700;color:#1a56db;margin-bottom:6px}
    .email-box p{font-size:14px;color:#555;line-height:1.5;margin:0}
    .steps{text-align:left;margin:24px 0;background:#f8f9fa;border-radius:12px;padding:20px}
    .step{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #eee}
    .step:last-child{border-bottom:none}
    .step-n{width:28px;height:28px;background:#8145FC;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
    .step strong{font-size:14px;display:block;margin-bottom:2px;color:#111}
    .step p{font-size:13px;color:#888;margin:0;line-height:1.5}
    .btn-primary{display:inline-block;padding:16px 40px;background:#8145FC;color:#fff;font-size:16px;font-weight:700;border-radius:8px;text-decoration:none;margin-top:24px;transition:background .2s}
    .btn-primary:hover{background:#391991}
    .btn-secondary{display:inline-block;padding:10px 24px;color:#8145FC;font-size:14px;font-weight:600;text-decoration:none;margin-top:12px}
    .btn-secondary:hover{text-decoration:underline}
    .fine{font-size:13px;color:#aaa;margin-top:20px;line-height:1.5}
  </style>
</head>
<body>
  <div class="card">
    <div class="check">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1>Your account has been created!</h1>
    <p class="sub">Welcome to KnoqGen. Your trial account is ready and waiting for you.</p>

    <div class="email-box">
      <div class="icon">&#9993;</div>
      <h3>Check your email</h3>
      <p>We just sent you an email with a link to set your password and log in to your new dashboard.</p>
    </div>

    <div class="steps">
      <div class="step">
        <div class="step-n">1</div>
        <div>
          <strong>Set your password</strong>
          <p>Click the link in your email (or use the button below) to create your password and log in.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-n">2</div>
        <div>
          <strong>Explore your dashboard</strong>
          <p>Your landing page builder, lead tracker, and QR code generator are all ready to go.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-n">3</div>
        <div>
          <strong>Drop it at a real door</strong>
          <p>Record a video, print a QR sticker, and watch leads roll in. Your 14-day free trial starts now.</p>
        </div>
      </div>
    </div>

    <a href="/login" class="btn-primary">Log In / Create Password</a>
    <br>
    <a href="/sell" class="btn-secondary">Back to Home</a>
    <p class="fine">Didn't get the email? Check your spam folder, or reach us at hello@knoqgen.com.</p>
  </div>
</body>
</html>`;
}

const TRIAL_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Heebo',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a1a;background:#f5f7fa;-webkit-font-smoothing:antialiased;line-height:1.45}
.tr-container{max-width:1080px;margin:0 auto;padding:0 20px}

/* Header */
.tr-header{background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 0}
.tr-header .tr-container{display:flex;justify-content:space-between;align-items:center}
.tr-logo{display:flex;align-items:center;text-decoration:none}
.tr-nav-link{color:#555;text-decoration:none;font-size:14px;font-weight:600}
.tr-nav-link:hover{color:#8145FC}

/* Main */
.tr-main{padding:40px 0 56px}
.tr-layout{display:grid;grid-template-columns:1.1fr 420px;gap:40px;align-items:start}
@media(max-width:860px){.tr-layout{grid-template-columns:1fr;gap:24px}}

/* Pitch */
.tr-badge{display:inline-block;background:#e8f5e9;color:#2e7d32;font-size:13px;font-weight:700;padding:6px 14px;border-radius:20px;margin-bottom:16px}
.tr-pitch h1{font-size:34px;font-weight:800;line-height:1.2;color:#111;margin-bottom:12px}
@media(max-width:600px){.tr-pitch h1{font-size:26px}}
.tr-lede{font-size:17px;color:#555;margin-bottom:24px;line-height:1.55}

.tr-checks{list-style:none;margin:0 0 28px;padding:0}
.tr-checks li{display:flex;gap:10px;padding:9px 0;font-size:15px;color:#333;line-height:1.5}
.tr-checks li span{flex-shrink:0;width:22px;height:22px;background:#8145FC;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-top:2px}
.tr-checks strong{color:#111}

.tr-preview{background:#fff;border-radius:16px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center}
.tr-preview img{max-width:100%;width:260px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.1)}
.tr-preview-caption{margin-top:12px;font-size:13px;color:#777;line-height:1.5}

/* Form card */
.tr-form-wrap{position:sticky;top:24px}
@media(max-width:860px){.tr-form-wrap{position:static}}
.tr-form-card{background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.tr-form-card h2{font-size:22px;font-weight:800;color:#111;margin-bottom:6px}
.tr-sub{font-size:14px;color:#888;margin-bottom:20px}

.tr-field{margin-bottom:14px}
.tr-field label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:5px}
.tr-field input,.tr-field select{width:100%;padding:12px;font-size:16px;font-family:'Heebo',sans-serif;border:1.5px solid #ddd;border-radius:8px;background:#fff;-webkit-appearance:none}
.tr-field select{appearance:none;background:#fff url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3e%3cpath fill='%23888' d='M6 8L0 0h12z'/%3e%3c/svg%3e") right 14px center no-repeat;padding-right:34px}
.tr-field input:focus,.tr-field select:focus{outline:none;border-color:#8145FC;box-shadow:0 0 0 3px rgba(129,69,252,.1)}
.tr-opt{color:#aaa;font-weight:400;font-size:12px}

.tr-btn{display:block;width:100%;padding:16px;background:#8145FC;color:#fff;font-size:16px;font-weight:700;font-family:'Heebo',sans-serif;border:none;border-radius:10px;cursor:pointer;margin-top:8px;transition:background .15s}
.tr-btn:hover{background:#391991}
.tr-btn:disabled{background:#C6ADFF;cursor:not-allowed}
.tr-fine{text-align:center;font-size:12px;color:#888;margin-top:10px}
.tr-error{margin-top:12px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#b91c1c;font-size:13px}

/* Trust row */
.tr-trust{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px;text-align:center}
.tr-trust div{background:#fff;border-radius:10px;padding:12px 8px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.tr-trust strong{display:block;font-size:14px;color:#111;font-weight:700;margin-bottom:2px}
.tr-trust span{font-size:11px;color:#888}

/* Footer */
.tr-footer{padding:24px 0;text-align:center;font-size:12px;color:#aaa}
.tr-footer a{color:#888;text-decoration:none;margin:0 4px}
.tr-footer a:hover{color:#8145FC}

/* Leave-Behind System upsell */
.tr-bundle-wrap{margin:18px 0 4px;border:2px solid #e2e8f0;border-radius:14px;overflow:hidden;transition:border-color .2s,box-shadow .2s;background:#fff}
.tr-bundle-wrap:has(#bundleCheck:checked){border-color:#8145FC;box-shadow:0 0 0 4px rgba(129,69,252,.1)}
.tr-bundle-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff}
.tr-bundle-badge{font-size:11px;font-weight:700;letter-spacing:.08em;color:#fbbf24;text-transform:uppercase}
.tr-bundle-price-tag{font-size:22px;font-weight:800;color:#fff}
.tr-bundle-inner{display:flex;gap:0;align-items:stretch}
.tr-bundle-img-col{width:140px;flex-shrink:0;background:#0a0e1a;overflow:hidden}
.tr-bundle-img{width:140px;height:100%;min-height:200px;object-fit:cover;object-position:center center;display:block}
.tr-bundle-content{padding:12px 14px;flex:1}
.tr-bundle-title{font-size:15px;font-weight:800;color:#111;margin-bottom:4px}
.tr-bundle-hook{font-size:13px;color:#555;line-height:1.5;margin-bottom:8px}
.tr-bundle-list{list-style:none;padding:0;margin:0 0 8px;display:flex;flex-direction:column;gap:4px}
.tr-bundle-list li{font-size:12px;color:#333;padding-left:16px;position:relative;line-height:1.4}
.tr-bundle-list li::before{content:"✓";position:absolute;left:0;color:#16a34a;font-weight:700}
.tr-bundle-roi{font-size:12px;color:#0369a1;font-weight:600;background:#e0f2fe;padding:4px 10px;border-radius:20px;display:inline-block}
.tr-bundle-cta-row{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f0f9ff;border-top:1px solid #bae6fd;cursor:pointer}
.tr-bundle-cta-row input[type=checkbox]{width:20px;height:20px;flex-shrink:0;accent-color:#8145FC;cursor:pointer}
.tr-bundle-cta-text{font-size:14px;font-weight:700;color:#0c4a6e;line-height:1.3}
.tr-bundle-qty{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid #dde6f5;background:#f8faff}
.tr-bundle-qty-label{font-size:13px;font-weight:600;color:#333;white-space:nowrap}
.tr-qty-controls{display:flex;align-items:center}
.tr-qty-controls button{width:30px;height:30px;border:1.5px solid #ccc;background:#fff;font-size:18px;font-weight:700;cursor:pointer;border-radius:6px;line-height:1;color:#333;transition:border-color .1s}
.tr-qty-controls button:hover{border-color:#8145FC;color:#8145FC}
.tr-qty-controls span{min-width:36px;text-align:center;font-size:16px;font-weight:700;color:#111}
.tr-bundle-total{font-size:15px;font-weight:700;color:#8145FC;margin-left:auto}
.tr-bundle-ships-note{font-size:11px;color:#888;text-align:center;padding:8px;border-top:1px solid #f0f0f0;background:#fafafa}
`;

// ── Step 2: intake form ──
function trialSetupPage(id: string, name: string, company: string): string {
  const safeId = esc(id);
  const safeName = esc(name);
  const safeCompany = esc(company);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finish Setup &mdash; KnoqGen</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>${TRIAL_CSS}${SETUP_CSS}</style>
</head>
<body>

<header class="tr-header">
  <div class="tr-container">
    <a href="/sell" class="tr-logo"><img src="/logo.png" alt="KnoqGen" style="height:34px;width:auto"></a>
    <span class="tr-nav-link" style="color:#2e7d32">Step 2 of 2</span>
  </div>
</header>

<main class="tr-main">
  <div class="tr-container" style="max-width:780px">
    <div class="setup-intro">
      <h1>Welcome, ${safeName}! Let's set up <span style="color:#8145FC">${safeCompany}</span>.</h1>
      <p class="setup-lede">About 3 minutes. Everything you enter here goes straight to our setup team &mdash; no phone calls, no back-and-forth. We'll build your account and email your login within one business day.</p>
    </div>

    <form id="setupForm" class="setup-form" novalidate>
      <input type="hidden" name="id" value="${safeId}">

      <!-- ═══ Company basics ═══ -->
      <section class="setup-section">
        <h2>1. Company basics</h2>

        <div class="setup-field">
          <label for="company_phone">Company phone <span class="req">*</span></label>
          <input id="company_phone" name="company_phone" type="tel" required placeholder="(555) 123-4567">
          <span class="hint">Shown to homeowners on your landing pages &amp; as a backup CTA.</span>
        </div>

        <div class="setup-field">
          <label for="tagline">One-line tagline <span class="req">*</span></label>
          <input id="tagline" name="tagline" type="text" required maxlength="100" placeholder="e.g. Locally owned. Family operated. 20+ years painting in Boise.">
          <span class="hint">Appears under your logo. 50-80 characters works best.</span>
        </div>

        <div class="setup-field">
          <label for="website">Website <span class="opt">(optional)</span></label>
          <input id="website" name="website" type="url" placeholder="https://yourcompany.com">
        </div>

        <div class="setup-field">
          <label>Services you offer <span class="opt">(pick all that apply)</span></label>
          <div class="chips" id="servicesChips">
            ${["Interior paint","Exterior paint","Cabinets","Fence/Deck","Pressure washing","Drywall","Commercial","Roofing","Siding","Other"].map(s =>
              `<label class="chip"><input type="checkbox" name="services" value="${esc(s)}"><span>${esc(s)}</span></label>`
            ).join("")}
          </div>
        </div>

        <div class="setup-field">
          <label for="service_areas">Service areas</label>
          <textarea id="service_areas" name="service_areas" rows="2" placeholder="e.g. Boise, Meridian, Eagle, Nampa"></textarea>
        </div>

        <div class="setup-field">
          <label for="primary_color">Brand color <span class="opt">(optional)</span></label>
          <div style="display:flex;gap:10px;align-items:center">
            <input id="primary_color" name="primary_color" type="color" value="#8145FC" style="width:52px;height:42px;padding:2px;border-radius:8px">
            <span class="hint" style="margin:0">We'll use this for buttons &amp; accents on your pages.</span>
          </div>
        </div>

        <div class="setup-field">
          <label>Logo <span class="opt">(PNG or JPG, up to 10 MB)</span></label>
          <div class="uploader" data-kind="logo" data-multiple="false">
            <input type="file" accept="image/*" hidden>
            <button type="button" class="upload-btn">Choose file</button>
            <div class="upload-list"></div>
          </div>
        </div>
      </section>

      <!-- ═══ Primary rep ═══ -->
      <section class="setup-section">
        <h2>2. Your first rep</h2>
        <p class="section-sub">The person who'll be featured in the video and named on the first landing page. You can add more reps later in the dashboard.</p>

        <div class="setup-field">
          <label for="rep_name">Rep name <span class="req">*</span></label>
          <input id="rep_name" name="rep_name" type="text" required placeholder="e.g. Mike Johnson">
        </div>
        <div class="setup-row">
          <div class="setup-field">
            <label for="rep_phone">Rep phone</label>
            <input id="rep_phone" name="rep_phone" type="tel" placeholder="(555) 987-6543">
          </div>
          <div class="setup-field">
            <label for="rep_email">Rep email</label>
            <input id="rep_email" name="rep_email" type="email" placeholder="mike@yourcompany.com">
          </div>
        </div>
      </section>

      <!-- ═══ First landing page ═══ -->
      <section class="setup-section">
        <h2>3. Your first test page</h2>
        <p class="section-sub">We'll build one landing page for a real house so you can try the full flow. Pick a neighbor, a job site, or an address you'd like to door-knock this week.</p>

        <div class="setup-field">
          <label for="test_address">Test address or neighborhood <span class="req">*</span></label>
          <input id="test_address" name="test_address" type="text" required placeholder="e.g. 880 E Stormy Dr, or Harris Ranch neighborhood">
        </div>

        <div class="setup-field">
          <label>Photos of past work <span class="opt">(up to 5, optional)</span></label>
          <div class="uploader" data-kind="photo" data-multiple="true">
            <input type="file" accept="image/*" multiple hidden>
            <button type="button" class="upload-btn">Choose photos</button>
            <div class="upload-list"></div>
          </div>
        </div>
      </section>

      <!-- ═══ Intro video ═══ -->
      <section class="setup-section">
        <h2>4. Intro video</h2>
        <p class="section-sub">A 20-30 second personal video is what makes this work. You have two options &mdash; pick whichever is easier.</p>

        <div class="video-options">
          <label class="video-option">
            <input type="radio" name="video_choice" value="upload" checked>
            <div class="vo-body">
              <strong>I'll upload a video I already have</strong>
              <span>MP4 or MOV, shot on your phone is perfect. Up to 100 MB.</span>
            </div>
          </label>
          <label class="video-option">
            <input type="radio" name="video_choice" value="script">
            <div class="vo-body">
              <strong>Write me a script &mdash; your team will record for me</strong>
              <span>You send a script, we record it for you in a day or two.</span>
            </div>
          </label>
        </div>

        <div id="videoUploadBox" class="setup-field">
          <label>Upload your video</label>
          <div class="uploader" data-kind="video" data-multiple="false">
            <input type="file" accept="video/*" hidden>
            <button type="button" class="upload-btn">Choose video</button>
            <div class="upload-list"></div>
          </div>
          <span class="hint">Tip: shoot vertical, 20-30 seconds, introduce yourself and your company, and end with "scan this code to get a free quote."</span>
        </div>

        <div id="videoScriptBox" class="setup-field" style="display:none">
          <label for="video_script">What should the video say? <span class="req">*</span></label>
          <textarea id="video_script" name="video_script" rows="5" placeholder="Hi, I'm [name] with [company]. I noticed you have [problem]. We just finished [nearby job] and we'd love to give you a free quote..."></textarea>
          <span class="hint">Write it conversationally &mdash; roughly 60-80 words = 30 seconds.</span>
        </div>
      </section>

      <!-- ═══ Anything else ═══ -->
      <section class="setup-section">
        <h2>5. Anything else we should know?</h2>
        <div class="setup-field">
          <textarea id="additional_notes" name="additional_notes" rows="3" placeholder="Goals, questions, how you heard about us, special offers you run, etc."></textarea>
        </div>
      </section>

      <!-- ═══ Submit ═══ -->
      <div class="setup-submit">
        <button type="submit" id="finishBtn" class="tr-btn">Finish Setup &rarr;</button>
        <p class="tr-fine">We'll email your login within one business day. No charge &mdash; your 14-day trial starts when you log in.</p>
        <div id="setupError" class="tr-error" style="display:none"></div>
      </div>
    </form>
  </div>
</main>

<footer class="tr-footer">
  &copy; ${new Date().getFullYear()} KnoqGen &middot; <a href="/sell">About</a>
</footer>

<script>
(function(){
  var TRIAL_ID = ${JSON.stringify(id)};
  var uploadedAssets = []; // [{kind, key, url, filename, size, content_type}]

  // ── File uploaders ──
  document.querySelectorAll('.uploader').forEach(function(box){
    var kind = box.getAttribute('data-kind');
    var multiple = box.getAttribute('data-multiple') === 'true';
    var input = box.querySelector('input[type=file]');
    var btn = box.querySelector('.upload-btn');
    var list = box.querySelector('.upload-list');

    btn.addEventListener('click', function(){ input.click(); });
    input.addEventListener('change', function(){
      var files = Array.from(input.files || []);
      if(!multiple && files.length > 1) files = files.slice(0, 1);
      files.forEach(function(f){ uploadFile(f, kind, list, multiple); });
      input.value = '';
    });
  });

  function uploadFile(file, kind, listEl, multiple){
    // If single-file uploader, clear previous
    if(!multiple){
      var oldKeys = uploadedAssets.filter(function(a){ return a.kind === kind; }).map(function(a){ return a.key; });
      uploadedAssets = uploadedAssets.filter(function(a){ return a.kind !== kind; });
      listEl.innerHTML = '';
    }
    // Photos cap at 5
    if(kind === 'photo' && uploadedAssets.filter(function(a){return a.kind==='photo';}).length >= 5){
      alert('Max 5 photos.');
      return;
    }

    var row = document.createElement('div');
    row.className = 'upload-row';
    row.innerHTML = '<span class="upload-name">' + escapeHtml(file.name) + '</span>' +
                    '<span class="upload-status">Uploading…</span>';
    listEl.appendChild(row);

    var fd = new FormData();
    fd.append('id', TRIAL_ID);
    fd.append('kind', kind);
    fd.append('file', file);

    fetch('/api/trial/upload', { method: 'POST', body: fd })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(res){
        if(res.ok && res.data.ok){
          uploadedAssets.push(res.data);
          row.querySelector('.upload-status').textContent = '✓ Uploaded';
          row.querySelector('.upload-status').classList.add('ok');
        } else {
          row.querySelector('.upload-status').textContent = 'Failed: ' + (res.data.error || 'try again');
          row.querySelector('.upload-status').classList.add('err');
        }
      })
      .catch(function(){
        row.querySelector('.upload-status').textContent = 'Network error';
        row.querySelector('.upload-status').classList.add('err');
      });
  }

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // ── Video option toggle ──
  var uploadBox = document.getElementById('videoUploadBox');
  var scriptBox = document.getElementById('videoScriptBox');
  document.querySelectorAll('input[name="video_choice"]').forEach(function(r){
    r.addEventListener('change', function(){
      if(this.value === 'upload'){ uploadBox.style.display=''; scriptBox.style.display='none'; }
      else { uploadBox.style.display='none'; scriptBox.style.display=''; }
    });
  });

  // ── Submit ──
  var err = document.getElementById('setupError');
  function showErr(msg){ err.textContent = msg; err.style.display='block'; window.scrollTo({top: err.offsetTop - 100, behavior:'smooth'}); }
  function clearErr(){ err.style.display='none'; err.textContent=''; }

  document.getElementById('setupForm').addEventListener('submit', function(e){
    e.preventDefault();
    clearErr();

    var services = [];
    document.querySelectorAll('input[name="services"]:checked').forEach(function(cb){ services.push(cb.value); });

    var videoChoice = document.querySelector('input[name="video_choice"]:checked').value;
    var hasVideoUpload = uploadedAssets.some(function(a){ return a.kind === 'video'; });
    var scriptVal = document.getElementById('video_script').value.trim();

    if(videoChoice === 'upload' && !hasVideoUpload){
      showErr('Please upload a video, or switch to "Write me a script".');
      return;
    }
    if(videoChoice === 'script' && !scriptVal){
      showErr('Please write out what the video should say.');
      return;
    }

    var body = {
      id: TRIAL_ID,
      company_phone: document.getElementById('company_phone').value.trim(),
      tagline: document.getElementById('tagline').value.trim(),
      website: document.getElementById('website').value.trim(),
      services: services,
      service_areas: document.getElementById('service_areas').value.trim(),
      primary_color: document.getElementById('primary_color').value,
      rep_name: document.getElementById('rep_name').value.trim(),
      rep_phone: document.getElementById('rep_phone').value.trim(),
      rep_email: document.getElementById('rep_email').value.trim(),
      test_address: document.getElementById('test_address').value.trim(),
      video_script: videoChoice === 'script' ? scriptVal : '',
      need_us_to_record_video: videoChoice === 'script',
      additional_notes: document.getElementById('additional_notes').value.trim(),
      assets: uploadedAssets
    };

    if(!body.company_phone || !body.tagline || !body.rep_name || !body.test_address){
      showErr('Please fill out the required fields (marked with *).');
      return;
    }

    var btn = document.getElementById('finishBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    fetch('/api/trial/setup', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
    .then(function(res){
      if(res.ok && res.data.ok){
        window.location.href = '/trial/success?done=1';
      } else {
        showErr(res.data.error || 'Something went wrong. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Finish Setup →';
      }
    })
    .catch(function(){
      showErr('Connection error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Finish Setup →';
    });
  });
})();
</script>
</body>
</html>`;
}

const SETUP_CSS = `
.setup-intro{margin-bottom:24px}
.setup-intro h1{font-size:28px;font-weight:800;line-height:1.2;color:#111;margin-bottom:10px}
@media(max-width:600px){.setup-intro h1{font-size:22px}}
.setup-lede{font-size:15px;color:#555;line-height:1.55}
.setup-form{display:flex;flex-direction:column;gap:20px}
.setup-section{background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.setup-section h2{font-size:17px;font-weight:800;color:#111;margin-bottom:4px}
.section-sub{font-size:13px;color:#888;margin-bottom:14px;line-height:1.5}
.setup-field{margin-bottom:14px}
.setup-field:last-child{margin-bottom:0}
.setup-field label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:5px}
.setup-field input[type=text],.setup-field input[type=tel],.setup-field input[type=email],.setup-field input[type=url],.setup-field textarea,.setup-field select{width:100%;padding:11px 12px;font-size:15px;font-family:'Heebo',sans-serif;border:1.5px solid #ddd;border-radius:8px;background:#fff;-webkit-appearance:none}
.setup-field input:focus,.setup-field textarea:focus,.setup-field select:focus{outline:none;border-color:#8145FC;box-shadow:0 0 0 3px rgba(129,69,252,.1)}
.setup-field textarea{resize:vertical;min-height:70px;line-height:1.5}
.setup-field .hint{display:block;margin-top:5px;font-size:12px;color:#999;line-height:1.4}
.setup-field .req{color:#dc2626;font-weight:700}
.setup-field .opt{color:#aaa;font-weight:400;font-size:12px}
.setup-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.setup-row{grid-template-columns:1fr}}

/* Chips */
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{position:relative;cursor:pointer}
.chip input{position:absolute;opacity:0;pointer-events:none}
.chip span{display:inline-block;padding:7px 14px;border:1.5px solid #ddd;border-radius:20px;font-size:13px;color:#555;background:#fff;transition:all .15s;user-select:none}
.chip:hover span{border-color:#8145FC}
.chip input:checked + span{background:#F0E8FF;border-color:#8145FC;color:#8145FC;font-weight:600}

/* File uploader */
.uploader{border:1.5px dashed #ccc;border-radius:10px;padding:14px;background:#fafbfc}
.upload-btn{padding:8px 16px;background:#fff;color:#8145FC;font-size:13px;font-weight:600;border:1.5px solid #8145FC;border-radius:8px;cursor:pointer;font-family:'Heebo',sans-serif}
.upload-btn:hover{background:#F0E8FF}
.upload-list{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.upload-list:empty{display:none}
.upload-row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;padding:6px 10px;background:#fff;border:1px solid #eee;border-radius:6px}
.upload-name{color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.upload-status{color:#888;font-size:12px;flex-shrink:0}
.upload-status.ok{color:#2e7d32;font-weight:600}
.upload-status.err{color:#b91c1c;font-weight:600}

/* Video options */
.video-options{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
@media(max-width:560px){.video-options{grid-template-columns:1fr}}
.video-option{display:flex;gap:10px;padding:14px;border:1.5px solid #ddd;border-radius:10px;cursor:pointer;transition:all .15s}
.video-option:hover{border-color:#8145FC}
.video-option input{flex-shrink:0;margin-top:3px}
.video-option:has(input:checked){border-color:#8145FC;background:#f0f7ff}
.vo-body{display:flex;flex-direction:column;gap:2px;font-size:13px}
.vo-body strong{color:#111;font-weight:700}
.vo-body span{color:#777}

/* Submit */
.setup-submit{background:#fff;border-radius:14px;padding:20px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.setup-submit .tr-btn{max-width:320px;margin:0 auto}
`;

export default trial;
