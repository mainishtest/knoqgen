import { Hono } from "hono";
import { getDb, type Env } from "../lib/db";
import { adminLayout, esc } from "../lib/html";
import { requireAuth, requireOwner, layoutCtx, type Ctx } from "../lib/session";

const admin = new Hono<Ctx>();

admin.use("/admin", requireAuth);
admin.use("/admin/*", requireAuth);

// ── GET /admin — Owner Dashboard ──
admin.get("/admin", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");

  const [monthStats] = await sql`
    SELECT
      (SELECT COUNT(*) FROM leads WHERE organization_id = ${org.id} AND created_at >= date_trunc('month', now())) as leads_this_month,
      (SELECT COUNT(*) FROM leads WHERE organization_id = ${org.id} AND created_at >= date_trunc('month', now()) AND status = 'new') as new_leads,
      (SELECT COUNT(*) FROM leads WHERE organization_id = ${org.id} AND created_at >= date_trunc('month', now()) AND status = 'won') as won_leads,
      (SELECT COUNT(*) FROM landing_pages WHERE organization_id = ${org.id} AND created_at >= date_trunc('month', now())) as pages_this_month,
      (SELECT COALESCE(SUM(scan_count), 0) FROM landing_pages WHERE organization_id = ${org.id} AND created_at >= date_trunc('month', now())) as scans_this_month
  `;

  const [allTime] = await sql`
    SELECT
      (SELECT COUNT(*) FROM landing_pages WHERE organization_id = ${org.id}) as total_pages,
      (SELECT COUNT(*) FROM landing_pages WHERE organization_id = ${org.id} AND is_active = true AND (expires_at IS NULL OR expires_at > now())) as active_pages,
      (SELECT COALESCE(SUM(scan_count), 0) FROM landing_pages WHERE organization_id = ${org.id}) as total_scans,
      (SELECT COUNT(*) FROM leads WHERE organization_id = ${org.id}) as total_leads,
      (SELECT COUNT(*) FROM leads WHERE organization_id = ${org.id} AND status = 'won') as total_won,
      (SELECT COALESCE(SUM(job_value), 0) FROM leads WHERE organization_id = ${org.id} AND status = 'won') as total_revenue,
      (SELECT COALESCE(SUM(job_value), 0) FROM leads WHERE organization_id = ${org.id} AND status IN ('contacted', 'quoted')) as pipeline_value
  `;

  const leadPipeline = await sql`
    SELECT status, COUNT(*) as count FROM leads WHERE organization_id = ${org.id} GROUP BY status
  `;
  const pipeline: Record<string, number> = {};
  leadPipeline.forEach((r: any) => { pipeline[r.status] = Number(r.count); });

  const urgentLeads = await sql`
    SELECT l.id, l.name, l.phone, l.status, l.created_at, lp.street_name, lp.slug
    FROM leads l
    JOIN landing_pages lp ON l.page_id = lp.id
    WHERE l.organization_id = ${org.id} AND l.status IN ('new', 'contacted')
    ORDER BY CASE l.status WHEN 'new' THEN 0 ELSE 1 END, l.created_at DESC
    LIMIT 8
  `;

  const monthConvRate = Number(monthStats.scans_this_month) > 0
    ? (Number(monthStats.leads_this_month) / Number(monthStats.scans_this_month) * 100).toFixed(1) : "0.0";

  const leadRows = urgentLeads.map((l: any) => {
    const isNew = l.status === 'new';
    return `
      <div class="lead-card" style="border-left:3px solid ${isNew ? '#c62828' : '#e65100'}">
        <div class="lead-header">
          <strong class="lead-name">${esc(l.name)}</strong>
          <span class="badge" style="background:${isNew ? '#c6282815' : '#e6510015'};color:${isNew ? '#c62828' : '#e65100'}">${isNew ? 'NEW' : 'CONTACTED'}</span>
        </div>
        <a href="tel:${esc(l.phone)}" class="lead-phone">${esc(l.phone)}</a>
        <div class="lead-meta">
          <span>From: <a href="/v/${esc(l.slug)}" target="_blank">${esc(l.street_name)}</a></span>
          <span>${getTimeAgo(new Date(l.created_at))}</span>
        </div>
        <div class="lead-actions">
          <a href="tel:${esc(l.phone)}" class="btn btn-sm">Call Now</a>
        </div>
      </div>`;
  }).join("");

  return c.html(adminLayout("Dashboard", `
    <h1>Dashboard</h1>
    <p class="text-muted" style="margin-top:-12px;margin-bottom:20px">${esc(org.display_name)} &middot; this month</p>

    <div class="stat-grid">
      <div class="stat-card"><div class="number">${monthStats.leads_this_month}</div><div class="label">Leads This Month</div></div>
      <div class="stat-card"><div class="number">${monthStats.scans_this_month}</div><div class="label">Scans</div></div>
      <div class="stat-card"><div class="number">${monthStats.pages_this_month}</div><div class="label">Pages Created</div></div>
      <div class="stat-card"><div class="number">${monthConvRate}%</div><div class="label">Scan &rarr; Lead</div></div>
    </div>

    ${urgentLeads.length > 0 ? `
    <div class="card" style="border-left:4px solid #c62828;margin-bottom:16px;padding:16px 20px">
      <h2 style="margin:0 0 12px;font-size:17px;color:#c62828">${pipeline['new'] || 0} Lead${(pipeline['new'] || 0) !== 1 ? 's' : ''} Need Follow-Up</h2>
      <div class="lead-list">${leadRows}</div>
    </div>` : `
    <div class="card" style="border-left:4px solid #2e7d32;margin-bottom:16px;padding:16px 20px">
      <strong style="color:#2e7d32">All caught up!</strong>
    </div>`}

    <div class="card">
      <h2 style="margin-top:0">Lead Pipeline</h2>
      <div class="pipeline">
        <div class="pipe-stage"><div class="pipe-num" style="color:#c62828">${pipeline['new'] || 0}</div><div class="pipe-label">New</div></div>
        <div class="pipe-arrow">&rarr;</div>
        <div class="pipe-stage"><div class="pipe-num" style="color:#e65100">${pipeline['contacted'] || 0}</div><div class="pipe-label">Contacted</div></div>
        <div class="pipe-arrow">&rarr;</div>
        <div class="pipe-stage"><div class="pipe-num" style="color:#1565c0">${pipeline['quoted'] || 0}</div><div class="pipe-label">Quoted</div></div>
        <div class="pipe-arrow">&rarr;</div>
        <div class="pipe-stage"><div class="pipe-num" style="color:#2e7d32">${pipeline['won'] || 0}</div><div class="pipe-label">Won</div></div>
      </div>
    </div>

    <div class="card" style="background:#f8f9fa">
      <h2 style="margin-top:0">All-Time Totals</h2>
      <div class="stat-grid" style="margin-bottom:0">
        <div class="stat-card"><div class="number">${allTime.active_pages}</div><div class="label">Active Pages</div></div>
        <div class="stat-card"><div class="number">${allTime.total_scans}</div><div class="label">Total Scans</div></div>
        <div class="stat-card"><div class="number">${allTime.total_leads}</div><div class="label">Total Leads</div></div>
        <div class="stat-card"><div class="number">${allTime.total_won}</div><div class="label">Jobs Won</div></div>
      </div>
    </div>

    <style>
    .pipeline{display:flex;align-items:center;justify-content:center;gap:4px;padding:8px 0}
    .pipe-stage{text-align:center;flex:1}
    .pipe-num{font-family:'Montserrat','Heebo',sans-serif;font-size:28px;font-weight:800}
    .pipe-label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px}
    .pipe-arrow{color:#ccc;font-size:18px;padding:0 2px}
    </style>
  `, layoutCtx(c)));
});

// ── GET /admin/leads ──
admin.get("/admin/leads", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");

  const leads = await sql`
    SELECT l.*, lp.street_name, lp.slug
    FROM leads l
    JOIN landing_pages lp ON l.page_id = lp.id
    WHERE l.organization_id = ${org.id}
    ORDER BY l.created_at DESC
    LIMIT 100
  `;

  const statusColors: Record<string, string> = { new: "#c62828", contacted: "#e65100", quoted: "#1565c0", won: "#2e7d32", lost: "#757575" };
  const nextStatus: Record<string, string> = { new: "contacted", contacted: "quoted", quoted: "won" };
  const nextLabels: Record<string, string> = { new: "Mark Contacted", contacted: "Mark Quoted", quoted: "Mark Won" };

  const leadCards = leads.map((l: any) => {
    const color = statusColors[l.status] || "#757575";
    const next = nextStatus[l.status];
    return `
    <div class="lead-card">
      <div class="lead-header">
        <strong class="lead-name">${esc(l.name)}</strong>
        <span class="badge" style="background:${color}15;color:${color};border:1px solid ${color}40">${l.status.toUpperCase()}</span>
      </div>
      <a href="tel:${esc(l.phone)}" class="lead-phone">${esc(l.phone)}</a>
      ${l.email ? `<span class="text-muted" style="font-size:13px">${esc(l.email)}</span>` : ""}
      ${l.project_note ? `<p class="lead-note">${esc(l.project_note)}</p>` : ""}
      <div class="lead-meta">
        <span>From: <a href="/v/${esc(l.slug)}" target="_blank">${esc(l.street_name)}</a></span>
        <span>${getTimeAgo(new Date(l.created_at))}</span>
      </div>
      <div class="lead-actions">
        <a href="tel:${esc(l.phone)}" class="btn btn-sm">Call</a>
        ${next ? `<form method="POST" action="/api/leads/${esc(l.id)}/status" style="display:inline">
          <input type="hidden" name="status" value="${next}">
          <button type="submit" class="btn btn-sm btn-outline">${nextLabels[l.status]}</button>
        </form>` : ""}
      </div>
    </div>`;
  }).join("");

  return c.html(adminLayout("Leads", `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h1 style="margin-bottom:0">Quote Requests</h1>
      ${leads.length ? `<a href="/api/leads/export" class="btn btn-sm btn-outline" style="white-space:nowrap">Export CSV</a>` : ""}
    </div>
    ${leads.length ? `<div class="lead-list" style="margin-top:16px">${leadCards}</div>` : `
      <div class="card" style="text-align:center;padding:40px 20px">
        <h2 style="color:#888">No quote requests yet</h2>
      </div>`}
  `, layoutCtx(c)));
});

// ── GET /admin/campaigns ──
admin.get("/admin/campaigns", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");

  const campaigns = await sql`
    SELECT c.*,
      (SELECT COUNT(*) FROM landing_pages lp WHERE lp.campaign_id = c.id AND lp.organization_id = ${org.id}) as page_count,
      (SELECT COUNT(*) FROM leads l WHERE l.organization_id = ${org.id} AND l.page_id IN (SELECT id FROM landing_pages WHERE campaign_id = c.id)) as lead_count
    FROM campaigns c
    WHERE c.organization_id = ${org.id}
    ORDER BY c.created_at DESC LIMIT 30
  `;
  const jobs = await sql`
    SELECT id, address, neighborhood FROM active_jobs WHERE organization_id = ${org.id} AND status = 'active' ORDER BY created_at DESC
  `;

  const jobOptions = jobs.map((j: any) =>
    `<option value="${esc(j.id)}">${esc(j.address)}${j.neighborhood ? ` (${esc(j.neighborhood)})` : ""}</option>`).join("");

  const campaignRows = campaigns.map((c: any) => `
    <tr>
      <td><strong>${esc(c.name)}</strong>${c.neighborhood ? `<br><span class="text-muted">${esc(c.neighborhood)}</span>` : ""}</td>
      <td>${c.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td>${c.page_count}</td>
      <td>${c.lead_count}</td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
    </tr>`).join("");

  return c.html(adminLayout("Campaigns", `
    <h1>Campaigns / Drops</h1>
    <div class="card">
      <h2 style="margin-top:0">New Campaign</h2>
      <form method="POST" action="/api/campaigns">
        <div class="form-group"><label>Campaign Name *</label><input type="text" name="name" required></div>
        <div class="form-group"><label>Neighborhood</label><input type="text" name="neighborhood"></div>
        ${jobs.length ? `<div class="form-group"><label>Linked Job</label><select name="job_id"><option value="">— None —</option>${jobOptions}</select></div>` : ""}
        <button type="submit" class="btn">Create Campaign</button>
      </form>
    </div>
    <div class="card">
      <h2 style="margin-top:0">All Campaigns</h2>
      ${campaigns.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Name</th><th>Status</th><th>Pages</th><th>Leads</th><th>Created</th></tr></thead><tbody>${campaignRows}</tbody></table></div>` : '<p class="text-muted">No campaigns yet.</p>'}
    </div>
  `, layoutCtx(c)));
});

// ── GET /admin/jobs ──
admin.get("/admin/jobs", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");

  const jobs = await sql`SELECT * FROM active_jobs WHERE organization_id = ${org.id} ORDER BY created_at DESC LIMIT 30`;
  const jobRows = jobs.map((j: any) => `
    <tr>
      <td>${esc(j.address)}</td>
      <td>${j.neighborhood ? esc(j.neighborhood) : '\u2014'}</td>
      <td>${j.status === 'active' ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Completed</span>'}</td>
      <td>${new Date(j.created_at).toLocaleDateString()}</td>
    </tr>`).join("");

  return c.html(adminLayout("Jobs", `
    <h1>Active Jobs</h1>
    <div class="card">
      <h2 style="margin-top:0">Add New Job</h2>
      <form method="POST" action="/api/jobs">
        <div class="form-group"><label>Address *</label><input type="text" name="address" required></div>
        <div class="form-group"><label>Neighborhood</label><input type="text" name="neighborhood"></div>
        <button type="submit" class="btn">Add Job</button>
      </form>
    </div>
    <div class="card">
      <h2 style="margin-top:0">All Jobs</h2>
      ${jobs.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Address</th><th>Neighborhood</th><th>Status</th><th>Created</th></tr></thead><tbody>${jobRows}</tbody></table></div>` : '<p class="text-muted">No jobs yet.</p>'}
    </div>
  `, layoutCtx(c)));
});

// ── GET /admin/team — owner-only: manage users ──
admin.get("/admin/team", requireOwner, async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");

  const members = await sql`
    SELECT u.id, u.email, u.name, m.role, m.is_active, m.accepted_at, m.invite_expires_at
    FROM memberships m JOIN users u ON m.user_id = u.id
    WHERE m.organization_id = ${org.id}
    ORDER BY m.created_at
  `;

  const memberRows = members.map((m: any) => {
    const pending = !m.accepted_at;
    return `<tr>
      <td><strong>${esc(m.name || m.email)}</strong><br><span class="text-muted">${esc(m.email)}</span></td>
      <td>${esc(m.role)}</td>
      <td>${pending ? '<span class="badge badge-inactive">Pending</span>' : '<span class="badge badge-active">Active</span>'}</td>
    </tr>`;
  }).join("");

  return c.html(adminLayout("Team", `
    <h1>Team</h1>
    <div class="card">
      <h2 style="margin-top:0">Invite a Rep</h2>
      <form method="POST" action="/invites">
        <div class="form-group"><label>Email</label><input type="email" name="email" required></div>
        <div class="form-group"><label>Role</label>
          <select name="role"><option value="rep">Rep</option><option value="owner">Owner</option></select>
        </div>
        <button type="submit" class="btn">Send Invite</button>
      </form>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Current Team</h2>
      <table><thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>${memberRows}</tbody></table>
    </div>
  `, layoutCtx(c)));
});

// ── GET /admin/settings — owner-only: org settings incl. custom domains ──
admin.get("/admin/settings", requireOwner, async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const brandRows = await sql`
    SELECT logo_key, brand_color, tagline, phone, website, service_areas, services
    FROM organizations WHERE id = ${org.id} LIMIT 1
  `;
  const b: any = brandRows[0] || {};
  const servicesArr: string[] = Array.isArray(b.services) ? b.services : [];
  const orgBranding = {
    logo_key: b.logo_key as string | null,
    brand_color: b.brand_color as string | null,
    tagline: b.tagline as string | null,
    phone: b.phone as string | null,
    website: b.website as string | null,
    service_areas: b.service_areas as string | null,
    services_str: servicesArr.join(", "),
  };
  return c.html(adminLayout("Settings", `
    <h1>Organization Settings</h1>
    <div class="card">
      <h2 style="margin-top:0">Profile</h2>
      <form method="POST" action="/api/org/profile">
        <div class="form-group"><label>Display Name</label><input type="text" name="display_name" value="${esc(org.display_name)}" required></div>
        <div class="form-group"><label>Reply-To Email</label><input type="email" name="reply_to_email" value="${esc(org.reply_to_email)}" required></div>
        <div class="form-group"><label>Lead Notification Email</label><input type="email" name="notify_email" value="${esc(org.notify_email)}" required></div>
        <button type="submit" class="btn">Save</button>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Branding</h2>
      <p class="text-muted" style="margin-bottom:16px">These appear on your public landing pages.</p>
      <form id="brandingForm">
        <div class="form-group">
          <label>Company Logo</label>
          ${orgBranding.logo_key ? `<div style="margin-bottom:8px"><img src="/api/video/${esc(orgBranding.logo_key)}" style="max-height:48px;border-radius:6px" alt="Current logo"></div>` : ""}
          <div class="upload-zone" id="logoZone" style="padding:16px">
            <p><strong>${orgBranding.logo_key ? "Replace Logo" : "Upload Logo"}</strong></p>
            <p class="text-muted" style="font-size:12px">PNG, JPG, or WebP — max 2 MB</p>
            <input type="file" id="logoInput" accept="image/*">
          </div>
          <input type="hidden" id="logoKey" name="logo_key" value="${esc(orgBranding.logo_key || "")}">
        </div>
        <div class="form-group"><label>Brand Color</label><input type="color" name="brand_color" value="${esc(orgBranding.brand_color || "#8145FC")}" style="width:60px;height:36px;padding:2px;border:1.5px solid #ddd;border-radius:6px;cursor:pointer"></div>
        <div class="form-group"><label>Tagline</label><input type="text" name="tagline" value="${esc(orgBranding.tagline || "")}" placeholder="e.g. "></div>
        <div class="form-group"><label>Phone Number</label><input type="tel" name="phone" value="${esc(orgBranding.phone || "")}" placeholder="(208) 555-1234"></div>
        <div class="form-group"><label>Website</label><input type="url" name="website" value="${esc(orgBranding.website || "")}" placeholder="https://yourcompany.com"></div>
        <div class="form-group"><label>Service Areas</label><input type="text" name="service_areas" value="${esc(orgBranding.service_areas || "")}" placeholder="Boise, Meridian, Eagle, Star"></div>
        <div class="form-group"><label>Services <span class="text-muted" style="font-weight:400">(comma-separated)</span></label><input type="text" name="services" value="${esc(orgBranding.services_str)}" placeholder="Exterior Painting, Interior Painting, Cabinet Painting"></div>
        <button type="submit" class="btn" id="brandingBtn">Save Branding</button>
      </form>
    </div>

    <script>
    (function(){
      var logoZone=document.getElementById('logoZone'),logoInput=document.getElementById('logoInput'),logoKey=document.getElementById('logoKey');
      logoZone.addEventListener('click',function(){logoInput.click()});
      logoInput.addEventListener('change',function(){
        if(!this.files.length)return;
        var file=this.files[0];
        if(file.size>2*1024*1024){alert('Logo must be under 2 MB');return}
        var fd=new FormData();fd.append('photo',file);
        logoZone.innerHTML='<p>Uploading...</p>';
        fetch('/api/upload-photo',{method:'POST',body:fd}).then(function(r){return r.json()}).then(function(d){
          if(d.key){logoKey.value=d.key;logoZone.innerHTML='<p style="color:#2e7d32"><strong>Uploaded!</strong></p>'}
          else{logoZone.innerHTML='<p style="color:#c62828">Upload failed</p>'}
        });
      });
      document.getElementById('brandingForm').addEventListener('submit',function(e){
        e.preventDefault();
        var btn=document.getElementById('brandingBtn');btn.disabled=true;btn.textContent='Saving...';
        var form=e.target;
        var body={
          logo_key:form.logo_key.value||null,
          brand_color:form.brand_color.value||null,
          tagline:form.tagline.value.trim()||null,
          phone:form.phone.value.trim()||null,
          website:form.website.value.trim()||null,
          service_areas:form.service_areas.value.trim()||null,
          services:form.services.value.trim()||null
        };
        fetch('/api/org/branding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
          .then(function(r){if(r.ok){location.reload()}else{btn.disabled=false;btn.textContent='Save Branding';alert('Error saving')}});
      });
    })();
    </script>

    <div class="card">
      <h2 style="margin-top:0">Sending Domain</h2>
      <p class="text-muted">Emails currently send from:
        <code>${org.sending_mode === 'custom' && org.custom_sending_verified ? `hello@${esc(org.custom_sending_domain || '')}` : `${esc(org.slug)}@leads.knoqgen.com`}</code>
      </p>
      <p class="text-muted">Replies go to <code>${esc(org.reply_to_email)}</code>.</p>
      <p style="margin-top:12px;font-size:13px">Want emails to send from your own domain? <a href="/admin/settings/sending-domain">Set up a custom sending domain &rarr;</a></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Custom Landing-Page Domain</h2>
      <p class="text-muted">Host your landing pages on your own domain (e.g. <code>go.yourcompany.com</code>).</p>
      <p style="margin-top:8px;font-size:13px">Status:
        ${org.custom_landing_domain
          ? (org.custom_landing_verified
              ? `<span class="badge badge-active">Verified: ${esc(org.custom_landing_domain)}</span>`
              : `<span class="badge badge-inactive">Pending: ${esc(org.custom_landing_domain)}</span>`)
          : `<span class="badge badge-inactive">Not configured</span>`}
      </p>
      <p style="margin-top:12px"><a href="/admin/settings/landing-domain" class="btn btn-outline">Configure Custom Domain</a></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Billing</h2>
      <p class="text-muted">Plan: ${org.plan ? esc(org.plan) : 'Trial'} &middot; Status: ${esc(org.billing_status || org.status)}</p>
      ${org.trial_ends_at ? `<p class="text-muted" style="font-size:13px">Trial ends ${new Date(org.trial_ends_at).toLocaleDateString()}</p>` : ''}
      <p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        ${org.status === 'trial' || !org.stripe_subscription_id ? `<a href="/checkout" class="btn">Start subscription</a>` : ''}
        ${org.stripe_customer_id ? `<form method="POST" action="/api/org/billing-portal" style="display:inline"><button type="submit" class="btn btn-outline">Manage billing &rarr;</button></form>` : ''}
      </p>
    </div>
  `, layoutCtx(c)));
});

// ── GET /admin/settings/landing-domain ──
admin.get("/admin/settings/landing-domain", requireOwner, async (c) => {
  const org = c.get("org");
  return c.html(adminLayout("Custom Landing Domain", `
    <h1>Custom Landing-Page Domain</h1>
    <div class="card">
      <p>Point your own domain (e.g. <code>go.yourcompany.com</code>) at our infrastructure so your landing pages live on your brand.</p>
      <form method="POST" action="/api/org/landing-domain">
        <div class="form-group">
          <label>Domain (e.g. go.yourcompany.com)</label>
          <input type="text" name="domain" value="${esc(org.custom_landing_domain || '')}" placeholder="go.yourcompany.com" required>
        </div>
        <button type="submit" class="btn">Save &amp; Get DNS Instructions</button>
      </form>
      ${org.custom_landing_domain ? `
        <div style="margin-top:20px;padding:16px;background:#f8f9fa;border-radius:8px">
          <p><strong>DNS setup for ${esc(org.custom_landing_domain)}:</strong></p>
          <ol style="margin-left:20px;margin-top:8px;font-size:14px">
            <li>Add a <code>CNAME</code> record in your DNS:<br>
              <code>${esc(org.custom_landing_domain)}</code> &rarr; <code>knoqgen.com</code></li>
            <li>We'll issue and install the SSL cert automatically.</li>
            <li>Verification usually takes 5–30 minutes.</li>
          </ol>
          <p style="margin-top:12px">Status: ${org.custom_landing_verified ? '<span class="badge badge-active">Verified</span>' : '<span class="badge badge-inactive">Pending verification</span>'}</p>
        </div>` : ''}
    </div>
  `, layoutCtx(c)));
});

// ── GET /admin/settings/sending-domain ──
admin.get("/admin/settings/sending-domain", requireOwner, async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const rows = await sql`
    SELECT resend_domain_id, sending_domain_records, custom_sending_domain, custom_sending_verified
    FROM organizations WHERE id = ${org.id}
  `;
  const row: any = rows[0] || {};
  const records: Array<{ record: string; name: string; type: string; value: string; ttl?: string | number; priority?: number; status?: string }> = Array.isArray(row.sending_domain_records) ? row.sending_domain_records : (row.sending_domain_records ? JSON.parse(row.sending_domain_records) : []);

  const recordsTable = records.length ? `
    <table style="width:100%;font-size:13px;margin-top:8px">
      <tr><th>Type</th><th>Name</th><th>Value</th><th>Priority/TTL</th><th>Status</th></tr>
      ${records.map(r => `<tr>
        <td><code>${esc(r.type)}</code></td>
        <td><code style="word-break:break-all">${esc(r.name)}</code></td>
        <td><code style="word-break:break-all">${esc(r.value)}</code></td>
        <td>${r.priority !== undefined ? `prio ${esc(String(r.priority))}` : ""} ${r.ttl !== undefined ? `ttl ${esc(String(r.ttl))}` : ""}</td>
        <td>${r.status ? `<span class="badge ${r.status === 'verified' ? 'badge-active' : 'badge-inactive'}">${esc(r.status)}</span>` : ""}</td>
      </tr>`).join("")}
    </table>` : "";

  const current = row.custom_sending_domain as string | null;
  const verified = !!row.custom_sending_verified;

  return c.html(adminLayout("Custom Sending Domain", `
    <p><a href="/admin/settings">← back to settings</a></p>
    <h1>Custom Sending Domain</h1>
    <div class="card">
      <p>Send lead-notification emails from your own domain (e.g. <code>mail.yourcompany.com</code>). Until you verify, emails keep sending from <code>${esc(org.slug)}@leads.knoqgen.com</code>.</p>
      ${current ? `
        <p style="margin-top:12px">Current: <code>${esc(current)}</code>
          ${verified ? '<span class="badge badge-active">Verified</span>' : '<span class="badge badge-inactive">Pending</span>'}</p>
      ` : ""}

      <form method="POST" action="/api/org/sending-domain" style="margin-top:16px">
        <div class="form-group">
          <label>${current ? "Change domain" : "Set up domain"}</label>
          <input type="text" name="domain" value="${esc(current || "")}" placeholder="mail.yourcompany.com" required pattern="[a-z0-9.-]+">
          <p class="text-muted" style="font-size:12px;margin-top:4px">Use a subdomain dedicated to sending — don't pick your main marketing domain.</p>
        </div>
        <button type="submit" class="btn">${current ? "Reconfigure" : "Create & get DNS records"}</button>
      </form>

      ${records.length ? `
        <div style="margin-top:20px;padding:16px;background:#f8f9fa;border-radius:8px">
          <p><strong>Add these DNS records at your registrar for ${esc(current || "")}:</strong></p>
          ${recordsTable}
          <p style="margin-top:12px;font-size:13px;color:#666">DNS changes can take a few minutes to propagate. Click <strong>Check status</strong> once they're live.</p>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <form method="POST" action="/api/org/sending-domain/verify" style="display:inline">
              <button type="submit" class="btn">Check status</button>
            </form>
            <form method="POST" action="/api/org/sending-domain/remove" style="display:inline" onsubmit="return confirm('Remove this sending domain? Emails will revert to the shared domain.')">
              <button type="submit" class="btn btn-danger">Remove</button>
            </form>
          </div>
          ${verified ? `<p style="margin-top:12px"><span class="badge badge-active">Verified</span> Emails now send from <code>hello@${esc(current || "")}</code>.</p>` : ""}
        </div>
      ` : ""}
    </div>
  `, layoutCtx(c)));
});

// ── GET /admin/analytics ──
admin.get("/admin/analytics", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");

  // ── Rep performance ──
  const repStats = await sql`
    SELECT
      COALESCE(lp.rep_name, 'Unknown') as rep_name,
      COUNT(DISTINCT lp.id) as pages_created,
      COALESCE(SUM(lp.scan_count), 0) as total_scans,
      COUNT(DISTINCT l.id) as total_leads,
      COUNT(DISTINCT CASE WHEN l.status = 'won' THEN l.id END) as won_leads,
      COALESCE(SUM(CASE WHEN l.status = 'won' THEN l.job_value ELSE 0 END), 0) as revenue
    FROM landing_pages lp
    LEFT JOIN leads l ON l.page_id = lp.id
    WHERE lp.organization_id = ${org.id}
    GROUP BY COALESCE(lp.rep_name, 'Unknown')
    ORDER BY total_leads DESC
  `;

  // ── Campaign performance ──
  const campaignStats = await sql`
    SELECT
      COALESCE(camp.name, 'No Campaign') as campaign_name,
      COUNT(DISTINCT lp.id) as pages_created,
      COALESCE(SUM(lp.scan_count), 0) as total_scans,
      COUNT(DISTINCT l.id) as total_leads,
      COUNT(DISTINCT CASE WHEN l.status = 'won' THEN l.id END) as won_leads,
      COALESCE(SUM(CASE WHEN l.status = 'won' THEN l.job_value ELSE 0 END), 0) as revenue
    FROM landing_pages lp
    LEFT JOIN leads l ON l.page_id = lp.id
    LEFT JOIN campaigns camp ON lp.campaign_id = camp.id
    WHERE lp.organization_id = ${org.id}
    GROUP BY COALESCE(camp.name, 'No Campaign')
    ORDER BY total_leads DESC
  `;

  // ── Weekly trend (last 8 weeks) ──
  const weeklyTrend = await sql`
    SELECT
      date_trunc('week', lp.created_at)::date as week_start,
      COUNT(DISTINCT lp.id) as pages,
      COALESCE(SUM(lp.scan_count), 0) as scans,
      COUNT(DISTINCT l.id) as leads
    FROM landing_pages lp
    LEFT JOIN leads l ON l.page_id = lp.id AND l.created_at >= lp.created_at - interval '1 day'
    WHERE lp.organization_id = ${org.id}
      AND lp.created_at >= now() - interval '8 weeks'
    GROUP BY date_trunc('week', lp.created_at)::date
    ORDER BY week_start
  `;

  // ── Top-performing pages ──
  const topPages = await sql`
    SELECT lp.street_name, lp.slug, lp.rep_name, lp.scan_count,
      (SELECT COUNT(*) FROM leads WHERE page_id = lp.id) as lead_count,
      (SELECT COUNT(*) FROM leads WHERE page_id = lp.id AND status = 'won') as won_count
    FROM landing_pages lp
    WHERE lp.organization_id = ${org.id}
    ORDER BY (SELECT COUNT(*) FROM leads WHERE page_id = lp.id) DESC, lp.scan_count DESC
    LIMIT 10
  `;

  function convRate(leads: number, scans: number): string {
    return scans > 0 ? (leads / scans * 100).toFixed(1) + "%" : "—";
  }

  function fmtMoney(cents: number): string {
    if (!cents) return "$0";
    return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
  }

  const repRows = repStats.map((r: any) => `
    <tr>
      <td><strong>${esc(r.rep_name)}</strong></td>
      <td>${r.pages_created}</td>
      <td>${r.total_scans}</td>
      <td>${r.total_leads}</td>
      <td>${convRate(Number(r.total_leads), Number(r.total_scans))}</td>
      <td>${r.won_leads}</td>
      <td>${fmtMoney(Number(r.revenue))}</td>
    </tr>`).join("");

  const campaignRows = campaignStats.map((r: any) => `
    <tr>
      <td><strong>${esc(r.campaign_name)}</strong></td>
      <td>${r.pages_created}</td>
      <td>${r.total_scans}</td>
      <td>${r.total_leads}</td>
      <td>${convRate(Number(r.total_leads), Number(r.total_scans))}</td>
      <td>${r.won_leads}</td>
      <td>${fmtMoney(Number(r.revenue))}</td>
    </tr>`).join("");

  const trendRows = weeklyTrend.map((w: any) => {
    const weekLabel = new Date(w.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `
    <tr>
      <td>${weekLabel}</td>
      <td>${w.pages}</td>
      <td>${w.scans}</td>
      <td>${w.leads}</td>
      <td>${convRate(Number(w.leads), Number(w.scans))}</td>
    </tr>`;
  }).join("");

  const topPageRows = topPages.map((p: any) => `
    <tr>
      <td><a href="/v/${esc(p.slug)}" target="_blank">${esc(p.street_name)}</a></td>
      <td>${p.rep_name ? esc(p.rep_name) : "—"}</td>
      <td>${p.scan_count}</td>
      <td>${p.lead_count}</td>
      <td>${p.won_count}</td>
      <td>${convRate(Number(p.lead_count), Number(p.scan_count))}</td>
    </tr>`).join("");

  // Calculate max scans for a simple bar chart
  const maxScans = Math.max(1, ...weeklyTrend.map((w: any) => Number(w.scans)));
  const trendBars = weeklyTrend.map((w: any) => {
    const weekLabel = new Date(w.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const scanPct = (Number(w.scans) / maxScans * 100).toFixed(0);
    const leadPct = (Number(w.leads) / maxScans * 100).toFixed(0);
    return `
      <div class="trend-bar-group">
        <div class="trend-bars">
          <div class="trend-bar scan-bar" style="height:${scanPct}%" title="${w.scans} scans"></div>
          <div class="trend-bar lead-bar" style="height:${leadPct}%" title="${w.leads} leads"></div>
        </div>
        <div class="trend-label">${weekLabel}</div>
      </div>`;
  }).join("");

  return c.html(adminLayout("Analytics", `
    <h1>Analytics</h1>
    <p class="text-muted" style="margin-top:-12px;margin-bottom:20px">${esc(org.display_name)}</p>

    ${weeklyTrend.length > 1 ? `
    <div class="card">
      <h2 style="margin-top:0">Weekly Trend</h2>
      <div class="trend-legend">
        <span><span class="dot" style="background:#8145FC"></span> Scans</span>
        <span><span class="dot" style="background:#2e7d32"></span> Leads</span>
      </div>
      <div class="trend-chart">${trendBars}</div>
    </div>` : ""}

    <div class="card">
      <h2 style="margin-top:0">Performance by Rep</h2>
      ${repStats.length ? `
        <div style="overflow-x:auto">
          <table><thead><tr><th>Rep</th><th>Pages</th><th>Scans</th><th>Leads</th><th>Conv %</th><th>Won</th><th>Revenue</th></tr></thead>
          <tbody>${repRows}</tbody></table>
        </div>` : '<p class="text-muted">No data yet.</p>'}
    </div>

    <div class="card">
      <h2 style="margin-top:0">Performance by Campaign</h2>
      ${campaignStats.length ? `
        <div style="overflow-x:auto">
          <table><thead><tr><th>Campaign</th><th>Pages</th><th>Scans</th><th>Leads</th><th>Conv %</th><th>Won</th><th>Revenue</th></tr></thead>
          <tbody>${campaignRows}</tbody></table>
        </div>` : '<p class="text-muted">No data yet.</p>'}
    </div>

    <div class="card">
      <h2 style="margin-top:0">Top Pages</h2>
      ${topPages.length ? `
        <div style="overflow-x:auto">
          <table><thead><tr><th>Street</th><th>Rep</th><th>Scans</th><th>Leads</th><th>Won</th><th>Conv %</th></tr></thead>
          <tbody>${topPageRows}</tbody></table>
        </div>` : '<p class="text-muted">No data yet.</p>'}
    </div>

    ${weeklyTrend.length ? `
    <div class="card" style="background:#f8f9fa">
      <h2 style="margin-top:0">Weekly Breakdown</h2>
      <div style="overflow-x:auto">
        <table><thead><tr><th>Week</th><th>Pages</th><th>Scans</th><th>Leads</th><th>Conv %</th></tr></thead>
        <tbody>${trendRows}</tbody></table>
      </div>
    </div>` : ""}

    <style>
    .trend-chart{display:flex;align-items:flex-end;gap:8px;height:120px;padding:8px 0}
    .trend-bar-group{flex:1;display:flex;flex-direction:column;align-items:center}
    .trend-bars{display:flex;gap:3px;align-items:flex-end;height:100px;width:100%}
    .trend-bar{flex:1;border-radius:3px 3px 0 0;min-height:2px;transition:height .3s}
    .scan-bar{background:#8145FC}
    .lead-bar{background:#2e7d32}
    .trend-label{font-size:10px;color:#888;margin-top:4px;white-space:nowrap}
    .trend-legend{display:flex;gap:16px;margin-bottom:12px;font-size:12px;color:#666}
    .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:middle}
    </style>
  `, layoutCtx(c)));
});

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default admin;
