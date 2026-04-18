import { Hono } from "hono";
import { getDb, type Env, type LandingPage, type Organization } from "../lib/db";
import { publicLayout, esc } from "../lib/html";
import { getSubdomain, isRootDomain, orgBaseUrl } from "../lib/subdomain";

const landing = new Hono<{ Bindings: Env }>();

// ── GET /v/:slug — The homeowner-facing landing page ──
landing.get("/v/:slug", async (c) => {
  const sql = getDb(c.env);
  const slug = c.req.param("slug");
  const host = (c.req.header("host") || "").toLowerCase();

  // Fetch the page with its org
  const rows = await sql`
    SELECT lp.*,
           aj.address as job_address, aj.neighborhood as job_neighborhood,
           o.id as org_id, o.slug as org_slug, o.display_name as org_display_name,
           o.phone as org_phone, o.website as org_website, o.logo_key as org_logo_key,
           o.brand_color as org_brand_color, o.tagline as org_tagline,
           o.services as org_services,
           o.service_areas as org_service_areas, o.custom_landing_domain,
           o.custom_landing_verified, o.status as org_status
    FROM landing_pages lp
    JOIN organizations o ON lp.organization_id = o.id
    LEFT JOIN active_jobs aj ON lp.job_id = aj.id
    WHERE lp.slug = ${slug}
    LIMIT 1
  `;

  const notFoundPhone = c.env.COMPANY_PHONE;
  if (!rows.length) {
    return c.html(publicLayout("Not Found", `
      <div class="expired">
        <h2>Page not found</h2>
        <p>This link may have expired or doesn't exist.</p>
        <p style="margin-top:16px"><a href="tel:${esc(notFoundPhone)}" class="btn-primary" style="display:inline-block;padding:14px 28px;border-radius:10px;text-decoration:none">Call Us: ${esc(notFoundPhone)}</a></p>
      </div>
    `), 404);
  }

  const page = rows[0] as LandingPage & {
    job_address?: string;
    job_neighborhood?: string;
    org_id: string;
    org_slug: string;
    org_display_name: string;
    org_phone: string | null;
    org_website: string | null;
    org_logo_key: string | null;
    org_brand_color: string | null;
    org_tagline: string | null;
    org_services: string[] | null;
    org_service_areas: string | null;
    custom_landing_domain: string | null;
    custom_landing_verified: boolean;
    org_status: string;
  };

  // ── Subdomain routing ──
  const subdomain = getSubdomain(host);
  const onRoot = isRootDomain(host);

  if (onRoot) {
    // knoqgen.com/v/slug → 301 to the org's subdomain
    return c.redirect(`${orgBaseUrl(page.org_slug, c.env.SITE_URL)}/v/${slug}`, 301);
  }

  if (subdomain && subdomain !== page.org_slug) {
    // Request came in on a different org's subdomain — not found
    return c.html(publicLayout("Not Found", `
      <div class="expired">
        <h2>Page not found</h2>
        <p>This link may have expired or doesn't exist.</p>
      </div>
    `), 404);
  }
  // ── End subdomain routing ──

  const companyName = page.org_display_name;
  const companyPhone = page.org_phone || c.env.COMPANY_PHONE;
  const companyTagline = page.org_tagline || c.env.COMPANY_TAGLINE;
  const brandColor = page.org_brand_color || "#007bff";

  // If the org has a verified custom landing domain and this request is not on it,
  // redirect to the canonical URL. Skip during trial/shared domain.
  if (
    page.custom_landing_domain &&
    page.custom_landing_verified &&
    host !== page.custom_landing_domain.toLowerCase()
  ) {
    return c.redirect(`https://${page.custom_landing_domain}/v/${slug}`, 301);
  }

  // Expiration & soft-delete checks
  const now = Date.now();
  const expired =
    (page.expires_at && new Date(page.expires_at).getTime() < now) ||
    page.video_deleted_at !== null ||
    !page.is_active ||
    page.org_status === "canceled" ||
    page.org_status === "suspended";

  if (expired) {
    return c.html(publicLayout(companyName, `
      <div class="expired">
        <h2>This offer has expired</h2>
        <p>We're no longer running a special in this neighborhood, but we'd still love to help!</p>
        <p style="margin-top:16px"><a href="tel:${esc(companyPhone)}" class="btn-primary" style="display:inline-block;padding:14px 28px;border-radius:10px;text-decoration:none">Call Us: ${esc(companyPhone)}</a></p>
      </div>
    `));
  }

  // Increment scan count + log event (fire and forget)
  const ua = c.req.header("user-agent") || "";
  sql`UPDATE landing_pages SET scan_count = scan_count + 1 WHERE id = ${page.id}`.catch(() => {});
  sql`INSERT INTO page_events (page_id, organization_id, event_type, metadata) VALUES (${page.id}, ${page.org_id}, 'page_view', ${JSON.stringify({ ua: ua.slice(0, 200) })})`.catch(() => {});

  const videoUrl = `/api/video/${page.video_key}`;
  const photos: string[] = Array.isArray(page.photos) ? page.photos : [];

  const locationName = page.job_neighborhood || page.street_name;

  const repNote = page.rep_note
    ? page.rep_note
    : `Hey there! We're working on a painting project right around the corner. If you've been thinking about freshening up your place, we'd love to stop by for a free quote. No pressure, no hassle \u2014 just honest pricing from a local crew.`;
  const repAttribution = page.rep_name
    ? `\u2014 ${esc(page.rep_name)}, ${esc(companyName)}`
    : `\u2014 ${esc(companyName)}`;

  const ogDescription = `${companyName} is painting near ${locationName}. Get a free, no-pressure quote.`;
  const pageUrl = `${c.env.SITE_URL}/v/${slug}`;
  const logoUrl = page.org_logo_key
    ? `/api/video/${page.org_logo_key}`
    : "/logo.png";
  const serviceAreas = page.org_service_areas || "Boise \u00b7 Meridian \u00b7 Eagle \u00b7 Star \u00b7 Kuna \u00b7 Nampa";

  const html = publicLayout(`${companyName} \u2014 Painting Near ${locationName}`, `
    <style>
      .btn-primary{background:${esc(brandColor)}}
      .btn-primary:hover{filter:brightness(.9)}
      .service-chip{color:${esc(brandColor)};background:${esc(brandColor)}1a;border-color:${esc(brandColor)}55}
      .header-location{color:${esc(brandColor)}}
      .trust-icon svg{stroke:${esc(brandColor)}}
      .form-group input:focus,.form-group textarea:focus{border-color:${esc(brandColor)};box-shadow:0 0 0 3px ${esc(brandColor)}1a}
    </style>

    <!-- ═══ BRANDED HEADER ═══ -->
    <div class="page-header">
      <img src="${logoUrl}" alt="${esc(companyName)}" class="header-logo">
      <div class="header-location">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Painting near ${esc(locationName)}
      </div>
    </div>

    <div class="hero">
      <div class="video-intro">
        <p class="video-label">A message from ${page.rep_name ? esc(page.rep_name) : "our team"}:</p>
      </div>
      <div class="video-wrap">
        <video id="vid" src="${videoUrl}" playsinline muted autoplay loop poster="" preload="metadata"></video>
        <div class="tap-hint" id="tapHint">Tap to unmute</div>
      </div>

      <div class="hero-copy">
        <h1 class="hero-headline">We're Painting Right Around the Corner</h1>
        <p class="hero-sub">We're already set up near <strong>${esc(locationName)}</strong>. We'd love to stop by and give you a free painting quote \u2014 no hassle, no obligation.</p>
      </div>

      <div class="hero-cta">
        <a href="#quoteForm" class="btn-primary" style="text-decoration:none">Get a Free Painting Quote</a>
      </div>
    </div>

    <div class="trust-section">
      <div class="trust-grid">
        <div class="trust-item">
          <div class="trust-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
          <div class="trust-label">Family-Owned<br><span>${esc(companyTagline)}</span></div>
        </div>
        <div class="trust-item">
          <div class="trust-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
          <div class="trust-label">Licensed &amp; Insured<br><span>100% satisfaction guarantee</span></div>
        </div>
        <div class="trust-item">
          <div class="trust-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
          <div class="trust-label">5-Star Rated<br><span>on Google Reviews</span></div>
        </div>
        <div class="trust-item">
          <div class="trust-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
          <div class="trust-label">Free Quotes<br><span>Simple, transparent pricing</span></div>
        </div>
      </div>
    </div>

    <div class="services-section">
      <p class="section-title">What We Paint</p>
      <div class="services-list">
        ${((): string => {
          const svc: string[] = Array.isArray(page.org_services) && page.org_services.length
            ? page.org_services
            : ["Exterior Painting", "Interior Painting", "Cabinet Painting", "Deck & Fence Staining", "Front Door & Trim", "Color Consultation"];
          return svc.map((s: string) => `<div class="service-chip">${esc(s)}</div>`).join("");
        })()}
      </div>
    </div>

    <div class="content">
      <p class="rep-note">&ldquo;${esc(repNote)}&rdquo;</p>
      <p class="rep-attribution">${repAttribution}</p>
    </div>

    ${photos.length ? `
      <div class="content"><p class="section-title">Our Recent Work Nearby</p></div>
      <div class="photos-scroll">
        ${photos.map((key: string) => `<img src="/api/video/${esc(key)}" alt="Recent painting work" loading="lazy">`).join("")}
      </div>
    ` : ""}

    <div class="cta-section" id="quoteForm">
      <h2 class="form-heading">Get Your Free Painting Quote</h2>
      <p class="form-sub">Tell us a little about your project. We'll reach out within 24 hours.</p>

      <form id="estimateForm" style="display:block">
        <div class="form-group">
          <label for="fname">Your Name</label>
          <input type="text" id="fname" name="name" required autocomplete="name" placeholder="e.g. Sarah Johnson">
        </div>
        <div class="form-group">
          <label for="fphone">Best Number to Reach You</label>
          <input type="tel" id="fphone" name="phone" required autocomplete="tel" placeholder="(208) 555-1234">
        </div>
        <div class="form-group">
          <label for="femail">Email <span class="optional-label">(optional)</span></label>
          <input type="email" id="femail" name="email" autocomplete="email" placeholder="you@email.com">
        </div>
        <div class="form-group">
          <label for="fnote">What Needs Painting?</label>
          <textarea id="fnote" name="project_note" placeholder="e.g. Exterior of house, front door, deck railing, cabinets..."></textarea>
        </div>
        <button type="submit" class="btn-primary" id="submitBtn">Get My Free Painting Quote</button>
        <p class="form-fine-print">No spam. No obligation. Just a simple, honest quote.</p>
      </form>

      <div id="successMsg" class="success-msg" style="display:none">
        <h3 id="thankYouHeading">You're all set!</h3>
        <p>Someone from our team will reach out within 24 hours to schedule your free painting quote.</p>
        <p style="margin-top:12px">Want to talk sooner? Give us a call:</p>
        <a href="tel:${esc(companyPhone)}" class="btn-call" style="margin-top:8px">${esc(companyPhone)}</a>
      </div>

      <a href="tel:${esc(companyPhone)}" class="btn-call" id="callBtn">Or Call Directly: ${esc(companyPhone)}</a>
    </div>

    <div class="company-footer">
      <img src="${logoUrl}" alt="${esc(companyName)}" style="height:28px;margin-bottom:8px;opacity:.5">
      <div>${esc(companyName)} &middot; ${esc(companyTagline)}</div>
      <div style="margin-top:4px;font-size:12px">${esc(serviceAreas)}</div>
    </div>

    <script>
    (function(){
      var vid = document.getElementById('vid');
      var hint = document.getElementById('tapHint');
      var pageId = '${page.id}';

      vid.addEventListener('click', function(){
        vid.muted = !vid.muted;
        hint.style.opacity = vid.muted ? '1' : '0';
        hint.textContent = vid.muted ? 'Tap to unmute' : '';
      });

      document.querySelector('.hero-cta a').addEventListener('click', function(e){
        e.preventDefault();
        document.getElementById('quoteForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
        track('cta_click');
      });

      var playTracked = false;
      vid.addEventListener('play', function(){
        if(!playTracked){ playTracked = true; track('video_play'); }
      });

      var completeTracked = false;
      vid.addEventListener('timeupdate', function(){
        if(!completeTracked && vid.duration && vid.currentTime / vid.duration > 0.9){
          completeTracked = true;
          track('video_complete');
        }
      });

      document.getElementById('callBtn').addEventListener('click', function(){ track('call_tap'); });

      var form = document.getElementById('estimateForm');
      var formStarted = false;
      form.addEventListener('focusin', function(){
        if(!formStarted){ formStarted = true; track('form_start'); }
      });

      form.addEventListener('submit', function(e){
        e.preventDefault();
        var btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.textContent = 'Sending...';

        var nameVal = document.getElementById('fname').value.trim();
        var body = {
          page_id: pageId,
          name: nameVal,
          phone: document.getElementById('fphone').value.trim(),
          email: document.getElementById('femail').value.trim() || null,
          project_note: document.getElementById('fnote').value.trim() || null
        };

        fetch('/api/leads', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(body)
        }).then(function(r){
          if(r.ok){
            form.style.display = 'none';
            var successDiv = document.getElementById('successMsg');
            successDiv.style.display = 'block';
            var firstName = nameVal.split(' ')[0];
            if(firstName){ document.getElementById('thankYouHeading').textContent = 'Thanks, ' + firstName + '!'; }
            document.getElementById('callBtn').style.display = 'none';
            track('form_submit');
          } else if(r.status === 429) {
            btn.disabled = false;
            btn.textContent = 'Get My Free Painting Quote';
            form.style.display = 'none';
            var successDiv = document.getElementById('successMsg');
            document.getElementById('thankYouHeading').textContent = "You've already submitted a request.";
            successDiv.querySelector('p').textContent = "We'll be in touch soon!";
            successDiv.style.display = 'block';
          } else {
            btn.disabled = false;
            btn.textContent = 'Get My Free Painting Quote';
            alert('Something went wrong. Please try calling us instead!');
          }
        }).catch(function(){
          btn.disabled = false;
          btn.textContent = 'Get My Free Painting Quote';
          alert('Connection error. Please try calling us instead!');
        });
      });

      function track(eventType){
        navigator.sendBeacon('/api/events', JSON.stringify({
          page_id: pageId,
          event_type: eventType
        }));
      }
    })();
    </script>
  `, {
    ogTitle: `${companyName} \u2014 Free Painting Quote`,
    ogDescription: ogDescription,
    ogUrl: pageUrl
  });

  return c.html(html);
});

export default landing;
