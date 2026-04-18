// Shared HTML layout helpers for server-rendered pages.
// We inline all CSS to keep the Worker self-contained and fast.
// Brand colors from knoqgen.com:
//   Primary blue: #007bff
//   Dark: #32373c
//   Body text: #555, #333
//   Fonts: Rubik (body), Montserrat (headings)

export type OgMeta = {
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
};

export function publicLayout(title: string, body: string, og?: OgMeta) {
  const ogTags = og ? `
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(og.ogTitle || title)}">
  <meta property="og:description" content="${esc(og.ogDescription || "")}">
  ${og.ogUrl ? `<meta property="og:url" content="${esc(og.ogUrl)}">` : ""}
  <meta property="og:image" content="https://knoqgen.com/og-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://knoqgen.com/og-card.png">
  <meta name="description" content="${esc(og.ogDescription || "")}">` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" sizes="32x32" href="/api/video/static/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/api/video/static/favicon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Rubik:wght@400;500;600&display=swap" rel="stylesheet">
  <title>${esc(title)}</title>${ogTags}
  <style>${PUBLIC_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

export type LayoutCtx = {
  orgName?: string;
  orgSlug?: string;
  memberships?: Array<{ organization_id: string; slug: string; display_name: string; role: string }>;
  activeOrgId?: string;
  userEmail?: string;
  isSuperAdmin?: boolean;
  isOwner?: boolean;
};

export function adminLayout(title: string, body: string, opts: boolean | LayoutCtx = true) {
  const showNav = opts === false ? false : true;
  const ctx: LayoutCtx | null = typeof opts === "object" && opts !== null ? opts : null;
  const brand = ctx?.orgName || "KnoqGen";
  const nav = showNav ? renderNav(brand, ctx) : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/png" sizes="32x32" href="/api/video/static/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/api/video/static/favicon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Rubik:wght@400;500;600&display=swap" rel="stylesheet">
  <title>${esc(title)} — ${esc(brand)}</title>
  <style>${ADMIN_CSS}</style>
</head>
<body>
  ${nav}
  <main class="container">${body}</main>
</body>
</html>`;
}

function renderNav(brand: string, ctx: LayoutCtx | null) {
  const memberships = ctx?.memberships || [];
  const hasMultiple = memberships.length > 1;
  const switcher = hasMultiple ? `
    <form method="POST" action="/switch-org" class="org-switcher">
      <select name="org_id" onchange="this.form.submit()">
        ${memberships.map(m => `<option value="${m.organization_id}" ${m.organization_id === ctx?.activeOrgId ? "selected" : ""}>${esc(m.display_name)}</option>`).join("")}
      </select>
    </form>` : "";
  const extraLinks = [
    ctx?.isOwner ? `<a href="/admin/team">Team</a>` : "",
    ctx?.isOwner ? `<a href="/admin/settings">Settings</a>` : "",
    ctx?.isSuperAdmin ? `<a href="/super" style="color:#ffb74d">Super</a>` : "",
    ctx ? `<a href="/logout">Sign out</a>` : "",
  ].filter(Boolean).join("");
  return `
<nav class="admin-nav">
  <a href="/admin" class="nav-brand">${esc(brand)}</a>
  <div class="nav-links">
    <a href="/rep">+ New</a>
    <a href="/admin">Dashboard</a>
    <a href="/admin/leads">Leads</a>
    <a href="/admin/campaigns">Campaigns</a>
    <a href="/admin/jobs">Jobs</a>
    <a href="/admin/analytics">Analytics</a>
    ${extraLinks}
    ${switcher}
  </div>
</nav>`;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Nav rendered dynamically by renderNav().

// ── Landing page CSS (mobile-first, brand-matched) ──
const PUBLIC_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Rubik',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#333;-webkit-font-smoothing:antialiased}

/* ── Branded header ── */
.page-header{max-width:480px;margin:0 auto;padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between}
.header-logo{height:36px;width:auto}
.header-location{font-size:13px;color:#007bff;font-weight:600}

/* ── Hero / Video ── */
.hero{position:relative;width:100%;max-width:480px;margin:0 auto}
.video-intro{padding:0 20px 8px}
.video-label{font-size:13px;color:#888;font-weight:500}
.video-wrap{width:100%;aspect-ratio:9/16;max-height:65vh;background:#000;border-radius:12px;overflow:hidden;position:relative;margin:0 20px;width:calc(100% - 40px)}
.video-wrap video{width:100%;height:100%;object-fit:cover}
.tap-hint{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;padding:6px 16px;border-radius:20px;font-size:13px;pointer-events:none;transition:opacity .3s}

/* ── Headline ── */
.hero-copy{padding:20px 20px 0}
.hero-headline{font-family:'Montserrat','Rubik',sans-serif;font-size:24px;font-weight:700;color:#32373c;line-height:1.2;margin-bottom:8px}
.hero-sub{font-size:16px;color:#555;line-height:1.5}
.hero-sub strong{color:#32373c}
.hero-cta{padding:16px 20px 0}

/* ── Trust section ── */
.trust-section{max-width:480px;margin:0 auto;padding:24px 20px}
.trust-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.trust-item{display:flex;align-items:flex-start;gap:10px;background:#f8f9fa;border-radius:10px;padding:12px}
.trust-icon{flex-shrink:0;width:24px;height:24px;margin-top:2px}
.trust-label{font-size:14px;font-weight:600;color:#32373c;line-height:1.3}
.trust-label span{font-weight:400;font-size:12px;color:#888}

/* ── Services ── */
.services-section{max-width:480px;margin:0 auto;padding:0 20px 24px}
.services-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.service-chip{background:#e8f4ff;border:1px solid #b8daff;border-radius:20px;padding:6px 14px;font-size:13px;color:#007bff;font-weight:500}

/* ── Content blocks ── */
.content{padding:0 20px 24px;max-width:480px;margin:0 auto}
.section-title{font-family:'Montserrat','Rubik',sans-serif;font-size:18px;font-weight:700;margin:0 0 8px;color:#32373c}
.rep-note{font-size:15px;line-height:1.6;color:#555;font-style:italic}
.rep-attribution{font-size:14px;color:#888;margin-top:6px;font-weight:500}

/* ── Form ── */
.cta-section{padding:20px;max-width:480px;margin:0 auto;background:#f8f9fa;border-radius:16px;margin-bottom:20px;margin-left:auto;margin-right:auto;max-width:calc(480px - 40px);margin-left:20px;margin-right:20px}
@media(min-width:520px){.cta-section{margin-left:auto;margin-right:auto;max-width:440px}}
.form-heading{font-family:'Montserrat','Rubik',sans-serif;font-size:22px;font-weight:700;color:#32373c;text-align:center;margin-bottom:4px}
.form-sub{font-size:14px;color:#888;text-align:center;margin-bottom:20px}
.form-fine-print{font-size:12px;color:#aaa;text-align:center;margin-top:12px}
.optional-label{color:#999;font-weight:400}
.btn-primary{display:block;width:100%;padding:16px;background:#007bff;color:#fff;font-family:'Rubik',sans-serif;font-size:17px;font-weight:600;border:none;border-radius:8px;cursor:pointer;text-align:center;text-decoration:none;transition:background .2s}
.btn-primary:hover{background:#0069d9}
.btn-primary:disabled{background:#80bdff;cursor:not-allowed}
.btn-call{display:block;width:100%;padding:14px;margin-top:10px;background:#fff;color:#32373c;font-size:16px;font-weight:600;border:2px solid #32373c;border-radius:8px;text-align:center;text-decoration:none}
.btn-call:hover{background:#f8f9fa}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:13px;font-weight:600;color:#555;margin-bottom:4px}
.form-group input,.form-group textarea{width:100%;padding:12px;font-size:16px;font-family:'Rubik',sans-serif;border:1.5px solid #ddd;border-radius:8px;background:#fff;-webkit-appearance:none}
.form-group textarea{resize:vertical;min-height:80px}
.form-group input:focus,.form-group textarea:focus{outline:none;border-color:#007bff;background:#fff;box-shadow:0 0 0 3px rgba(0,123,255,.1)}
.success-msg{background:#e8f5e9;border:1px solid #a5d6a7;border-radius:12px;padding:24px;text-align:center;color:#2e7d32}
.success-msg h3{font-family:'Montserrat','Rubik',sans-serif;margin-bottom:8px;font-size:20px}

/* ── Misc ── */
.expired{text-align:center;padding:60px 20px;color:#888}
.expired h2{font-family:'Montserrat','Rubik',sans-serif;color:#32373c;margin-bottom:8px}
.photos-scroll{display:flex;gap:8px;padding:0 20px 8px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.photos-scroll img{width:200px;height:150px;object-fit:cover;border-radius:8px;flex-shrink:0}
.company-footer{text-align:center;padding:24px 20px 40px;font-size:13px;color:#999;max-width:480px;margin:0 auto}
.company-footer img{display:block;margin:0 auto 8px}
`;

// ── Admin / rep CSS (brand-matched) ──
const ADMIN_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Rubik',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fa;color:#333}
.admin-nav{background:#32373c;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.nav-brand{color:#fff;font-family:'Montserrat','Rubik',sans-serif;font-weight:700;font-size:17px;text-decoration:none}
.nav-links{display:flex;gap:16px}
.nav-links a{color:rgba(255,255,255,.85);text-decoration:none;font-size:14px;font-weight:500}
.nav-links a:hover{color:#fff}
.org-switcher select{background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 8px;font-size:13px}
.org-switcher{display:inline-block}
.container{max-width:800px;margin:0 auto;padding:20px}
h1{font-family:'Montserrat','Rubik',sans-serif;font-size:24px;margin-bottom:16px;color:#32373c}
h2{font-family:'Montserrat','Rubik',sans-serif;font-size:20px;margin:24px 0 12px;color:#32373c}
.card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat-card .number{font-family:'Montserrat','Rubik',sans-serif;font-size:32px;font-weight:700;color:#007bff}
.stat-card .label{font-size:13px;color:#888;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;padding:10px 12px;background:#f0f4f8;color:#555;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
td{padding:10px 12px;border-bottom:1px solid #eee}
tr:hover td{background:#fafbfc}
.badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:600}
.badge-active{background:#e8f5e9;color:#2e7d32}
.badge-inactive{background:#fce4ec;color:#c62828}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:14px;font-weight:600;color:#333;margin-bottom:6px}
.form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 12px;font-size:15px;font-family:'Rubik',sans-serif;border:1.5px solid #ddd;border-radius:8px;background:#fff}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:#007bff;box-shadow:0 0 0 3px rgba(0,123,255,.1)}
.btn{display:inline-block;padding:10px 20px;background:#007bff;color:#fff;font-family:'Rubik',sans-serif;font-size:15px;font-weight:600;border:none;border-radius:8px;cursor:pointer;text-decoration:none}
.btn:hover{background:#0069d9}
.btn-sm{padding:6px 14px;font-size:13px}
.btn-outline{background:#fff;color:#007bff;border:1.5px solid #007bff}
.btn-danger{background:#c62828;color:#fff}
.btn-danger:hover{background:#a51b1b}
.login-wrap{max-width:360px;margin:80px auto;text-align:center}
.login-wrap h1{margin-bottom:8px}
.login-wrap p{color:#666;margin-bottom:24px}
.qr-wrap{text-align:center;padding:20px;background:#fff;border-radius:12px;margin-top:16px}
.qr-wrap canvas{margin:0 auto}
.qr-actions{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.upload-zone{border:2px dashed #ccc;border-radius:12px;padding:40px 20px;text-align:center;color:#888;cursor:pointer;transition:border-color .2s,background .2s}
.upload-zone:hover,.upload-zone.dragover{border-color:#007bff;background:#e8f4ff;color:#007bff}
.upload-zone input{display:none}
.upload-progress{margin-top:12px}
.progress-bar{height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden}
.progress-bar-fill{height:100%;background:#007bff;transition:width .3s}
.lead-list{display:flex;flex-direction:column;gap:12px}
.lead-card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.lead-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.lead-name{font-size:16px}
.lead-phone{display:block;color:#007bff;font-size:15px;font-weight:600;text-decoration:none;margin-bottom:4px}
.lead-note{font-size:14px;color:#555;margin:8px 0;line-height:1.4}
.lead-meta{display:flex;justify-content:space-between;font-size:13px;color:#888;margin:8px 0}
.lead-meta a{color:#007bff}
.lead-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.hidden{display:none}
.text-muted{color:#888;font-size:13px}
.mt-2{margin-top:8px}
.mt-4{margin-top:16px}
.mb-2{margin-bottom:8px}
.mb-4{margin-bottom:16px}
`;
