import { Hono } from "hono";
import type { Env } from "../lib/db";

const sales = new Hono<{ Bindings: Env }>();

// ── Sales page — serves at both / and /sell ──
sales.get("/sell", (c) => {
  return c.html(salesPage());
});
sales.get("/home", (c) => {
  return c.html(salesPage());
});

// ── GET /privacy — Privacy Policy ──
sales.get("/privacy", (c) => {
  return c.html(legalPage("Privacy Policy", `
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: April 10, 2026</p>

    <h2>What We Collect</h2>
    <p>When you use KnoqGen, we collect the information you provide: your name, email address, company name, and payment information (processed securely by Stripe — we never store your card details).</p>
    <p>When homeowners submit a quote request through a landing page, we collect their name, phone number, email (if provided), and project description. This data belongs to your company and is used solely to deliver leads to you.</p>

    <h2>How We Use Your Data</h2>
    <ul>
      <li>To provide and operate the KnoqGen service</li>
      <li>To send you lead notifications when homeowners request quotes</li>
      <li>To process subscription payments via Stripe</li>
      <li>To communicate about your account or service updates</li>
    </ul>

    <h2>Video &amp; Media Storage</h2>
    <p>Videos uploaded by sales reps are stored securely on Cloudflare R2. Videos are accessible via the landing page URL and are not shared with any third parties.</p>

    <h2>Third-Party Services</h2>
    <ul>
      <li><strong>Stripe</strong> — payment processing</li>
      <li><strong>Cloudflare</strong> — hosting, video storage, and content delivery</li>
      <li><strong>Neon</strong> — database hosting</li>
      <li><strong>Resend</strong> — email notifications</li>
    </ul>

    <h2>Data Retention</h2>
    <p>Your data is retained as long as your account is active. If you cancel your subscription, you may request deletion of your data by emailing us.</p>

    <h2>Contact</h2>
    <p>Questions about privacy? Email <a href="mailto:hello@knoqgen.com">hello@knoqgen.com</a>.</p>
  `));
});

// ── GET /terms — Terms of Service ──
sales.get("/terms", (c) => {
  return c.html(legalPage("Terms of Service", `
    <h1>Terms of Service</h1>
    <p class="updated">Last updated: April 10, 2026</p>

    <h2>Service</h2>
    <p>KnoqGen provides a platform for local service businesses to create personalized video landing pages with QR codes for door-to-door sales teams. By subscribing, you agree to these terms.</p>

    <h2>Subscriptions &amp; Billing</h2>
    <ul>
      <li>Monthly plan: $99/month, includes 3 sales rep accounts</li>
      <li>Annual plan: $990/year, includes 3 sales rep accounts</li>
      <li>Additional reps: $20/month per rep</li>
      <li>All payments are processed by Stripe</li>
      <li>You may cancel at any time — no long-term contracts</li>
      <li>Refunds are handled on a case-by-case basis</li>
    </ul>

    <h2>Acceptable Use</h2>
    <p>You agree not to use KnoqGen to create content that is illegal, misleading, harassing, or violates any applicable laws. We reserve the right to remove content or suspend accounts that violate these terms.</p>

    <h2>Your Content</h2>
    <p>You retain ownership of all videos, text, and images you upload. By uploading content, you grant us a license to host and serve it through the platform for the purpose of operating the service.</p>

    <h2>Limitation of Liability</h2>
    <p>KnoqGen is provided &ldquo;as is.&rdquo; We are not liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability is limited to the amount you paid in the 12 months preceding any claim.</p>

    <h2>Changes</h2>
    <p>We may update these terms from time to time. Continued use of the service after changes constitutes acceptance.</p>

    <h2>Contact</h2>
    <p>Questions? Email <a href="mailto:hello@knoqgen.com">hello@knoqgen.com</a>.</p>
  `));
});

function legalPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — KnoqGen</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/api/video/static/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/api/video/static/favicon-180.png">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#fff;color:#333;padding:40px 20px}
    .legal{max-width:640px;margin:0 auto}
    .legal h1{font-size:28px;font-weight:800;margin-bottom:4px;color:#111}
    .legal h2{font-size:18px;font-weight:700;margin:28px 0 8px;color:#111}
    .legal p{font-size:15px;line-height:1.7;margin-bottom:12px;color:#555}
    .legal ul{margin:0 0 16px 20px;font-size:15px;line-height:1.7;color:#555}
    .legal a{color:#007bff}
    .updated{font-size:14px;color:#aaa;margin-bottom:24px}
    .back{display:inline-block;margin-bottom:24px;font-size:14px;color:#007bff;text-decoration:none}
  </style>
</head>
<body>
  <div class="legal">
    <a href="/sell" class="back">&larr; Back to KnoqGen</a>
    ${body}
  </div>
</body>
</html>`;
}

function salesPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KnoqGen &mdash; Turn Missed Doors Into Booked Jobs</title>
  <meta name="description" content="Your reps knock 100 doors. Only 20 answer. KnoqGen turns the other 80 into leads. Simple. Affordable. Built for door-to-door teams.">
  <meta property="og:title" content="KnoqGen &mdash; Turn Missed Doors Into Booked Jobs">
  <meta property="og:description" content="Stop losing leads to unanswered doors. Leave a personalized video at every door and capture leads even when no one's home.">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://knoqgen.com/og-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://knoqgen.com/og-card.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/api/video/static/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/api/video/static/favicon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>${SALES_CSS}</style>
</head>
<body>

<!-- ═══ NAV ═══ -->
<nav class="sales-nav">
  <div class="container" style="display:flex;justify-content:space-between;align-items:center">
    <a href="/sell" style="display:flex;align-items:center;text-decoration:none"><img src="/api/video/static/logo.png" alt="KnoqGen" style="height:40px;width:auto"></a>
    <a href="/login" class="nav-login">Log In</a>
  </div>
</nav>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- HERO -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="hero" style="padding-top:32px">
  <div class="container">
    <div class="eyebrow">KnoqGen</div>
    <h1>Your Reps Knocked 100 Doors Today.<br>80 Didn't Answer.<br><span class="hero-highlight">What If You Could Close Those Too?</span></h1>
    <p class="hero-sub">Right now, every unanswered door is a dead lead. Your rep walked there, knocked, waited &mdash; and left a flyer nobody will read.</p>
    <p class="hero-sub"><strong>KnoqGen turns those 80 doors into live leads.</strong></p>
    <div class="hero-steps">
      <p>Your rep records a 30-second video at the door</p>
      <p>Leaves a QR code on a sticker</p>
      <p>Homeowner gets home, scans it, sees a real person, and requests a quote</p>
    </div>

    <div class="hero-proof">
      <div class="hero-proof-item">
        <strong>60 seconds</strong><span>to create a page</span>
      </div>
      <div class="hero-proof-item">
        <strong>Zero tech skills</strong><span>needed from reps</span>
      </div>
      <div class="hero-proof-item">
        <strong>1 job</strong><span>pays for a full year</span>
      </div>
    </div>

    <div class="hero-buttons">
      <a href="/trial" class="btn-cta btn-cta-big">Start 14-Day Free Trial &rarr;</a>
      <a href="#how" class="btn-cta-outline">See How It Works</a>
    </div>
    <p class="hero-note">Free for 14 days &middot; No credit card required &middot; Set up in 10 minutes</p>

    <!-- Phone mockup — what the homeowner actually sees -->
    <div class="phone-preview">
      <div class="phone-frame">
        <img src="/landing-hero-mobile.png" alt="Example KnoqGen landing page — 880 E Stormy Dr, with a 30-second video from David and a Get a Free Painting Quote button." loading="lazy" width="300" height="640">
      </div>
      <p class="phone-caption">This is what the homeowner sees when they scan the QR code &mdash; a real person, not a flyer.</p>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- THE PROBLEM -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section">
  <div class="container">
    <h2>Let's Be Real&hellip;</h2>

    <p class="section-text">Your team knocks <strong>100 doors.</strong></p>

    <div class="problem-grid">
      <div class="problem-card">
        <div class="problem-number">~20</div>
        <p>people answer</p>
      </div>
      <div class="problem-card">
        <div class="problem-number">~5</div>
        <p>are actually interested</p>
      </div>
      <div class="problem-card">
        <div class="problem-number">80</div>
        <p>doors? <strong>Gone. Wasted.</strong></p>
      </div>
    </div>

    <div class="problem-detail">
      <p class="section-text" style="margin-top:32px"><strong>Door hangers?</strong></p>
      <ul class="problem-list">
        <li>Get ignored</li>
        <li>Get thrown away</li>
        <li>Don't build trust</li>
      </ul>
      <p class="section-text">Meanwhile, your reps are burning time walking door to door with nothing to show for it.</p>
      <p class="section-text callout"><strong>That's lost money. Every single day.</strong></p>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- THE FIX -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section section-dark">
  <div class="container">
    <div class="eyebrow" style="color:rgba(255,255,255,.5)">The Fix</div>
    <h2 style="color:#fff">KnoqGen Changes What Happens<br>After the Knock</h2>
    <p class="section-text" style="color:rgba(255,255,255,.75)">Instead of leaving a boring hanger&hellip;</p>
    <p class="section-text" style="color:#fff"><strong>Your rep leaves a personalized video message right on the door.</strong></p>
    <p class="section-text" style="color:rgba(255,255,255,.75)">Now when the homeowner comes back?</p>
    <p class="section-text" style="color:rgba(255,255,255,.75)">They don't see junk mail.</p>
    <div class="fix-points">
      <p>They see a <strong>real person</strong></p>
      <p>A <strong>real message</strong></p>
      <p>From someone <strong>already working in their neighborhood</strong></p>
    </div>
    <p class="section-text" style="color:#fff;margin-top:24px"><strong>And they can request a quote instantly.</strong></p>

    <!-- Full landing page screenshot, dark-section framed -->
    <div class="page-preview-dark">
      <figure>
        <img src="/landing-preview-mobile.png" alt="Full scroll of a KnoqGen landing page: hero video, trust badges, service list, and lead capture form." loading="lazy" width="320" height="1100">
        <figcaption>A real page built by a rep in under 60 seconds &mdash; no designer needed.</figcaption>
      </figure>
    </div>

    <a href="#how" class="btn-cta" style="margin-top:24px">See How It Works &darr;</a>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- HOW IT WORKS -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section" id="how">
  <div class="container">
    <h2>How It Works</h2>

    <!-- Before/After contrast -->
    <div class="contrast-block">
      <div class="contrast-col contrast-old">
        <div class="contrast-label">Without KnoqGen</div>
        <p>Rep knocks. No answer.</p>
        <p>Leaves a door hanger.</p>
        <p>Homeowner throws it away.</p>
        <p class="contrast-result">Result: <strong>$0</strong></p>
      </div>
      <div class="contrast-col contrast-new">
        <div class="contrast-label">With KnoqGen</div>
        <p>Rep knocks. No answer.</p>
        <p>Records a 30-second video. Sticks a QR code.</p>
        <p>Homeowner scans it that evening. Sees a real person. Requests a quote.</p>
        <p class="contrast-result">Result: <strong>New lead</strong></p>
      </div>
    </div>

    <h3 style="text-align:center;margin:32px 0 8px;font-size:22px;color:#32373c">Three Simple Steps. About 60 Seconds.</h3>
    <p class="section-sub" style="text-align:center">No app to download. No tech skills required.</p>

    <div class="steps3">
      <div class="step3">
        <div class="step3-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </div>
        <div class="step3-num">1</div>
        <h3>Record a 30-Second Video</h3>
        <p>Right at the door, on your phone. Use one of our 20 proven scripts &mdash; or your own. &ldquo;Hey &mdash; we're painting a house right around the corner&hellip;&rdquo;</p>
      </div>
      <div class="step3-arrow" aria-hidden="true">&rarr;</div>
      <div class="step3">
        <div class="step3-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3z"/><path d="M20 14v3"/><path d="M14 20h3"/><path d="M20 20v1"/></svg>
        </div>
        <div class="step3-num">2</div>
        <h3>Leave the QR Sticker</h3>
        <p>Print a sticker or slap it on your existing leave-behind. 10 seconds and you're on to the next door.</p>
      </div>
      <div class="step3-arrow" aria-hidden="true">&rarr;</div>
      <div class="step3">
        <div class="step3-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
        </div>
        <div class="step3-num">3</div>
        <h3>Homeowner Scans &amp; Requests a Quote</h3>
        <p>They see a real person, not junk mail. One tap and you've got a lead in your inbox.</p>
      </div>
    </div>

    <!-- Screenshot: the rep-side "New Door Knock" screen -->
    <figure class="product-shot">
      <img src="/dashboard-new-knock.svg" alt="Rep dashboard: Create new door knock with video recording, address, neighborhood tag, and auto-generated QR code." loading="lazy" width="800" height="560">
      <figcaption>What your rep sees: tap record, type the address, print the QR. That's the whole tool.</figcaption>
    </figure>

    <div style="text-align:center;margin-top:28px">
      <p class="section-text"><strong>Your rep's already at the door. This adds 60 seconds and turns a dead knock into a live lead.</strong></p>
      <a href="#pricing" class="btn-cta" style="margin-top:12px">Start Using KnoqGen &rarr;</a>
      <p style="margin-top:10px;font-size:14px;color:#666">Includes 20 proven video scripts your reps can use immediately.</p>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- SCRIPT VAULT (bonus offer) -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section" style="background:#f8f9fa" id="scripts">
  <div class="container">
    <h2 style="text-align:center">Your Reps Will Know Exactly What to Say</h2>
    <p class="section-sub" style="text-align:center;max-width:560px;margin:0 auto 20px">KnoqGen doesn't just give you the tool &mdash; we give your reps the words.</p>

    <ul class="check-list">
      <li><strong>20 proven video scripts</strong> included with every plan</li>
      <li>Designed to increase scans and responses</li>
      <li>Easy to customize for your service and offer</li>
      <li>No more awkward or unsure reps</li>
    </ul>

    <p class="section-text callout" style="margin-top:24px;text-align:center"><strong>Just hit record, follow the script, and move to the next door.</strong></p>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- BENEFITS -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section" style="background:#f8f9fa">
  <div class="container">
    <h2>What This Actually Does for Your Business</h2>

    <ul class="check-list">
      <li>Turn missed doors into real leads</li>
      <li>Get more results from the same effort</li>
      <li>Build trust instantly with video</li>
      <li>Stand out from every competitor using hangers</li>
      <li>Capture homeowners when they're actually home</li>
      <li>Give your reps a real advantage in the field</li>
    </ul>

    <p class="section-text callout" style="margin-top:24px;text-align:center"><strong>Turn missed doors into money.</strong></p>

    <!-- Screenshot: admin/rep dashboard with weekly metrics + recent pages -->
    <figure class="product-shot">
      <img src="/dashboard-home.svg" alt="KnoqGen dashboard showing pages created, scans, leads, and a list of recent landing pages." loading="lazy" width="800" height="560">
      <figcaption>Every scan, every lead, every rep &mdash; in one dashboard.</figcaption>
    </figure>

    <a href="/trial" class="btn-cta" style="display:block;text-align:center;margin-top:16px">Start 14-Day Free Trial &rarr;</a>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- THE MATH -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section section-blue">
  <div class="container">
    <h2 style="color:#fff">Let's Do the Math</h2>

    <div class="math-block">
      <div class="math-row">
        <span>Your rep knocks</span>
        <strong>100 doors</strong>
      </div>
      <div class="math-row">
        <span>People who answer</span>
        <strong>~20</strong>
      </div>
      <div class="math-row">
        <span>Doors with no answer</span>
        <strong class="red">80 (lost)</strong>
      </div>
      <div class="math-divider"></div>
      <div class="math-row">
        <span>Even if just <strong>5%</strong> of those 80 scan&hellip;</span>
        <strong class="green">4 extra leads</strong>
      </div>
      <div class="math-row">
        <span>If just ONE becomes a job&hellip;</span>
        <strong class="green">$2,000 &ndash; $15,000+</strong>
      </div>
    </div>

    <p style="color:rgba(255,255,255,.8);text-align:center;margin-top:24px;font-size:18px"><strong style="color:#fff">The tool costs $99/month.</strong> One job pays for an entire year.</p>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WHO IT'S FOR -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section">
  <div class="container">
    <h2>Built for Door-to-Door Teams</h2>
    <p class="section-sub">If your business knocks doors, this was built for you.</p>

    <div class="industry-grid">
      <div class="industry-chip">Painting Companies</div>
      <div class="industry-chip">Roofing Companies</div>
      <div class="industry-chip">Solar Companies</div>
      <div class="industry-chip">Pest Control</div>
      <div class="industry-chip">Landscaping</div>
      <div class="industry-chip">HVAC</div>
      <div class="industry-chip">Plumbing</div>
      <div class="industry-chip">Window &amp; Siding</div>
      <div class="industry-chip">Home Security</div>
      <div class="industry-chip">Electrical</div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- OBJECTION HANDLING -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section" style="background:#f8f9fa">
  <div class="container">
    <h2>You Might Be Thinking&hellip;</h2>

    <div class="faq-list">
      <div class="faq">
        <h3>&ldquo;My reps aren't techy.&rdquo;</h3>
        <p>Good &mdash; this isn't techy. If they can record a video on their phone and stick a label on a door, they can use this. One screen, one button. We've had 60-year-old reps figure it out in under two minutes.</p>
      </div>
      <div class="faq">
        <h3>&ldquo;Will people actually scan a QR code?&rdquo;</h3>
        <p>They do. Every phone made in the last 5 years scans QR codes with the regular camera. No app needed. Even a 3&ndash;5% scan rate from unanswered doors gives you leads you would have gotten ZERO of otherwise.</p>
      </div>
      <div class="faq">
        <h3>&ldquo;Is this hard to set up?&rdquo;</h3>
        <p>You can be up and running in 10 minutes. Sign up, have your rep record a video, and you've got a live page with a QR code. No developers. No integrations. No IT department.</p>
      </div>
      <div class="faq">
        <h3>&ldquo;We already use door hangers.&rdquo;</h3>
        <p>Great. Put a QR code on them. Now your door hanger has a personalized video behind it. It goes from &ldquo;another piece of paper&rdquo; to &ldquo;wow, this company left me a personal video.&rdquo; Night and day.</p>
      </div>
      <div class="faq">
        <h3>&ldquo;What if it doesn't work for us?&rdquo;</h3>
        <p>Cancel anytime. No contracts. No annual commitment required. Try it for one neighborhood run and see the results before you decide.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- PRICING -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section section-dark" id="pricing">
  <div class="container">
    <h2 style="color:#fff">Simple Pricing. No Surprises.</h2>
    <p class="section-sub" style="color:rgba(255,255,255,.5)">Everything included. No per-scan fees. No hidden costs. No contracts.</p>

    <!-- Screenshot: leads view on dashboard — reinforces the payoff right before the pricing cards -->
    <figure class="product-shot product-shot-dark">
      <img src="/dashboard-leads.svg" alt="Leads dashboard showing incoming estimate requests from scanned QR codes, with status tags for New, Contacted, and Won." loading="lazy" width="800" height="560">
      <figcaption>Leads show up here in real time, tagged by the page that brought them in.</figcaption>
    </figure>

    <div class="pricing-grid">
      <div class="price-card">
        <div class="price-label">Monthly</div>
        <div class="price-amount">$99<span>/mo</span></div>
        <ul class="price-features">
          <li>Up to 3 sales reps included</li>
          <li>Unlimited landing pages</li>
          <li>Unlimited video uploads</li>
          <li>QR code generation + printing</li>
          <li>Lead notifications by email</li>
          <li>Admin dashboard + analytics</li>
          <li>$20/mo per additional rep</li>
        </ul>
        <a href="/trial" class="btn-price">Start Free Trial &rarr;</a>
        <p class="price-note">14 days free &middot; No credit card &middot; Then $99/mo</p>
      </div>

      <div class="price-card price-card-best">
        <div class="price-badge">Best Value &mdash; 2 Months Free</div>
        <div class="price-label">Annual</div>
        <div class="price-amount">$990<span>/yr</span></div>
        <div class="price-savings">That's $82.50/mo &mdash; save $198/year</div>
        <ul class="price-features">
          <li>Everything in Monthly</li>
          <li>Up to 3 sales reps included</li>
          <li>Priority support</li>
          <li>$20/mo per additional rep</li>
        </ul>
        <a href="/checkout?plan=annual" class="btn-price btn-price-best">Lock In Annual &mdash; Save $198 &rarr;</a>
        <p class="price-note" style="color:rgba(255,255,255,.5)">Or <a href="/trial" style="color:rgba(255,255,255,.85);text-decoration:underline">start with a free trial</a> and switch to annual anytime</p>
      </div>
    </div>

    <!-- Industry-specific ROI anchoring -->
    <div class="roi-box">
      <p style="font-size:15px;color:rgba(255,255,255,.5);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">What one extra job is worth to you</p>
      <div class="roi-grid">
        <div class="roi-item">
          <div class="roi-amount">$3K&ndash;$8K</div>
          <div class="roi-label">Exterior paint job</div>
        </div>
        <div class="roi-item">
          <div class="roi-amount">$8K&ndash;$15K</div>
          <div class="roi-label">New roof</div>
        </div>
        <div class="roi-item">
          <div class="roi-amount">$15K&ndash;$30K</div>
          <div class="roi-label">Solar install</div>
        </div>
        <div class="roi-item">
          <div class="roi-amount">$2K&ndash;$5K</div>
          <div class="roi-label">Pest control annual</div>
        </div>
      </div>
      <div class="roi-bottom">
        <p>KnoqGen costs <strong>$99/month.</strong></p>
        <p style="font-size:20px;margin-top:4px"><strong>One job pays for 1&ndash;10 years of the tool.</strong></p>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- FINAL CTA -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="section" id="start">
  <div class="container" style="text-align:center">
    <h2>Every Door Your Rep Knocked Today<br>That Didn't Answer?</h2>
    <p class="section-text" style="max-width:560px;margin:0 auto">That was a potential customer. They weren't home &mdash; but they will be tonight. And when they get home, what are they going to find on their door?</p>
    <p class="section-text" style="max-width:560px;margin:0 auto 24px"><strong>A crumpled flyer? Or a personalized video from your team?</strong></p>
    <div class="hero-buttons" style="justify-content:center">
      <a href="/trial" class="btn-cta btn-cta-big">Start 14-Day Free Trial &rarr;</a>
      <a href="/checkout" class="btn-cta-outline" style="border-color:#333;color:#333">Skip Trial &mdash; Subscribe Now</a>
    </div>
    <p style="color:#888;font-size:14px;margin-top:12px">14 days free &middot; No credit card &middot; Cancel anytime &middot; Set up in 10 minutes</p>

    <div class="guarantee-box">
      <h3>Zero Risk</h3>
      <ul>
        <li>No contracts &mdash; cancel anytime</li>
        <li>No setup fees</li>
        <li>No per-scan charges</li>
        <li>Works with your existing team &mdash; no new hires needed</li>
        <li>Up and running in one afternoon</li>
      </ul>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- FOOTER -->
<!-- ═══════════════════════════════════════════════════════ -->
<footer class="sales-footer">
  <div class="container">
    <img src="/api/video/static/logo.png" alt="KnoqGen" style="height:48px;width:auto;margin-bottom:8px">
    <p>Turn missed doors into booked jobs.</p>
    <p style="margin-top:12px;font-size:14px"><a href="mailto:hello@knoqgen.com" style="color:rgba(255,255,255,.7)">hello@knoqgen.com</a></p>
    <div style="margin-top:12px;display:flex;gap:16px;justify-content:center;font-size:12px">
      <a href="/privacy" style="color:rgba(255,255,255,.4)">Privacy Policy</a>
      <a href="/terms" style="color:rgba(255,255,255,.4)">Terms of Service</a>
    </div>
    <p style="margin-top:8px;font-size:12px;color:#888">&copy; 2026 KnoqGen. All rights reserved.</p>
  </div>
</footer>

</body>
</html>`;
}

const SALES_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;background:#fff}
.container{max-width:720px;margin:0 auto;padding:0 20px}

/* ── Nav ── */
.sales-nav{background:#111;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.nav-login{color:rgba(255,255,255,.7);font-size:14px;font-weight:600;text-decoration:none;padding:6px 16px;border:1.5px solid rgba(255,255,255,.2);border-radius:6px;transition:border-color .2s,color .2s}
.nav-login:hover{color:#fff;border-color:rgba(255,255,255,.5)}

/* ── Hero ── */
.hero{background:#111;color:#fff;padding:60px 0 48px;text-align:center}
.eyebrow{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.45);margin-bottom:20px}
.hero h1{font-size:36px;font-weight:900;line-height:1.15;margin-bottom:20px;letter-spacing:-0.5px}
@media(max-width:600px){.hero h1{font-size:28px}}
.hero-sub{font-size:18px;color:rgba(255,255,255,.7);line-height:1.5;margin-bottom:12px;max-width:560px;margin-left:auto;margin-right:auto}
.hero-sub strong{color:#fff}
.hero-steps{margin:24px auto;max-width:360px;text-align:left}
.hero-steps p{font-size:17px;color:#fff;padding:6px 0;font-weight:500}
.hero-steps p:before{content:"\\1F449 ";margin-right:4px}
.hero-buttons{display:flex;flex-direction:column;gap:12px;align-items:center;margin-top:24px}
.btn-cta{display:inline-block;padding:16px 32px;background:#007bff;color:#fff;font-size:17px;font-weight:700;border-radius:8px;text-decoration:none;transition:background .2s}
.btn-cta:hover{background:#0069d9}
.btn-cta-big{font-size:19px;padding:18px 40px}
.btn-cta-outline{display:inline-block;padding:14px 28px;background:transparent;color:#fff;font-size:16px;font-weight:600;border:2px solid rgba(255,255,255,.3);border-radius:8px;text-decoration:none;transition:border-color .2s}
.btn-cta-outline:hover{border-color:rgba(255,255,255,.6)}
.hero-highlight{color:#5bb8ff}
.hero-proof{display:flex;gap:1px;margin:28px auto 0;max-width:480px;background:rgba(255,255,255,.1);border-radius:10px;overflow:hidden}
.hero-proof-item{flex:1;text-align:center;padding:14px 8px;background:rgba(255,255,255,.04)}
.hero-proof-item strong{display:block;font-size:17px;color:#fff;margin-bottom:2px}
.hero-proof-item span{font-size:12px;color:rgba(255,255,255,.5)}
.hero-note{font-size:14px;color:rgba(255,255,255,.35);margin-top:16px}

/* ── Sections ── */
.section{padding:56px 0}
.section-dark{background:#111;color:#fff}
.section-blue{background:#007bff}
.section h2{font-size:28px;font-weight:800;line-height:1.2;margin-bottom:16px;letter-spacing:-0.3px}
@media(max-width:600px){.section h2{font-size:22px}}
.section-sub{font-size:16px;color:#888;margin-bottom:32px}
.section-text{font-size:17px;line-height:1.6;color:#555;margin-bottom:12px}
.section-text strong{color:#1a1a1a}
.callout{font-size:20px;color:#1a1a1a}

/* ── Problem ── */
.problem-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
@media(max-width:600px){.problem-grid{grid-template-columns:1fr}}
.problem-card{background:#f8f9fa;border-radius:12px;padding:24px;text-align:center}
.problem-number{font-size:44px;font-weight:900;color:#c62828;margin-bottom:4px}
.problem-card p{font-size:15px;color:#555;line-height:1.5}
.problem-card p strong{color:#c62828}
.problem-list{list-style:none;margin:8px 0 20px;padding:0}
.problem-list li{font-size:17px;color:#555;padding:4px 0}
.problem-list li:before{content:"\\1F449 ";margin-right:4px}

/* ── Fix section ── */
.fix-points{margin:20px auto;max-width:420px;text-align:left}
.fix-points p{font-size:18px;color:rgba(255,255,255,.7);padding:6px 0}
.fix-points p:before{content:"\\1F449 ";margin-right:4px}
.fix-points p strong{color:#fff}

/* ── Before/After contrast ── */
.contrast-block{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:24px 0 0;border-radius:12px;overflow:hidden}
@media(max-width:600px){.contrast-block{grid-template-columns:1fr}}
.contrast-col{padding:24px;font-size:15px;line-height:1.6}
.contrast-col p{margin-bottom:8px;color:#555}
.contrast-old{background:#fef2f2}
.contrast-old .contrast-label{color:#c62828}
.contrast-old .contrast-result strong{color:#c62828}
.contrast-new{background:#f0fdf4}
.contrast-new .contrast-label{color:#2e7d32}
.contrast-new .contrast-result strong{color:#2e7d32}
.contrast-new p{color:#333}
.contrast-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.contrast-result{margin-top:8px;font-size:17px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08)}

/* ── Steps ── */
.steps{display:flex;flex-direction:column;gap:24px;margin-top:24px}
.step{display:flex;gap:16px;align-items:flex-start}
.step-num{width:40px;height:40px;background:#007bff;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;flex-shrink:0}
.step h3{font-size:17px;font-weight:700;margin-bottom:4px;color:#1a1a1a}
.step p{font-size:15px;color:#555;line-height:1.5}

/* ── Check list (benefits) ── */
.check-list{list-style:none;margin:0;padding:0;max-width:480px}
.check-list li{font-size:18px;color:#333;padding:10px 0;border-bottom:1px solid #eee;font-weight:500}
.check-list li:before{content:"\\2713 ";color:#2e7d32;font-weight:700;margin-right:8px}

/* ── Math block ── */
.math-block{background:rgba(255,255,255,.08);border-radius:12px;padding:24px;max-width:480px;margin:24px auto 0}
.math-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;font-size:16px;color:rgba(255,255,255,.8)}
.math-row strong{color:#fff}
.math-row .red{color:#ef5350}
.math-row .green{color:#66bb6a}
.math-divider{height:1px;background:rgba(255,255,255,.15);margin:8px 0}

/* ── Industry chips ── */
.industry-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:16px}
.industry-chip{background:#f8f9fa;border:1.5px solid #e0e0e0;border-radius:24px;padding:10px 18px;font-size:15px;font-weight:500;color:#333}

/* ── FAQ ── */
.faq-list{display:flex;flex-direction:column;gap:16px;margin-top:24px}
.faq{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.faq h3{font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:8px}
.faq p{font-size:15px;color:#555;line-height:1.6}

/* ── Pricing ── */
.pricing-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:32px}
@media(max-width:600px){.pricing-grid{grid-template-columns:1fr}}
.price-card{background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;text-align:center}
.price-card-best{background:rgba(0,123,255,.15);border-color:#007bff;position:relative;padding-top:36px}
.price-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#007bff;color:#fff;font-size:13px;font-weight:700;padding:4px 16px;border-radius:20px;white-space:nowrap}
.price-label{font-size:14px;font-weight:600;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.price-amount{font-size:48px;font-weight:900;color:#fff;margin-bottom:4px}
.price-amount span{font-size:20px;font-weight:500;color:rgba(255,255,255,.5)}
.price-savings{font-size:14px;color:#66bb6a;font-weight:600;margin-bottom:16px}
.price-features{list-style:none;text-align:left;margin-bottom:20px}
.price-features li{padding:6px 0;font-size:14px;color:rgba(255,255,255,.7);border-bottom:1px solid rgba(255,255,255,.06)}
.price-features li:before{content:"\\2713 ";color:#66bb6a;font-weight:700;margin-right:6px}
.btn-price{display:block;padding:14px;background:rgba(255,255,255,.1);color:#fff;border:1.5px solid rgba(255,255,255,.2);border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;transition:background .2s}
.btn-price:hover{background:rgba(255,255,255,.15)}
.btn-price-best{background:#007bff;border-color:#007bff}
.btn-price-best:hover{background:#0069d9}
.price-note{font-size:12px;color:rgba(255,255,255,.35);margin-top:12px}
.roi-box{background:rgba(255,255,255,.06);border-radius:12px;padding:24px;margin-top:32px;text-align:center;font-size:16px;color:rgba(255,255,255,.8);line-height:1.6}
.roi-box strong{color:#fff}
.roi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin:16px 0;background:rgba(255,255,255,.08);border-radius:8px;overflow:hidden}
@media(max-width:600px){.roi-grid{grid-template-columns:1fr 1fr}}
.roi-item{text-align:center;padding:16px 8px;background:rgba(255,255,255,.03)}
.roi-amount{font-size:20px;font-weight:800;color:#66bb6a}
.roi-label{font-size:12px;color:rgba(255,255,255,.5);margin-top:4px}
.roi-bottom{margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1);text-align:center;color:rgba(255,255,255,.8)}

/* ── Guarantee ── */
.guarantee-box{max-width:400px;margin:32px auto 0;background:#f8f9fa;border-radius:12px;padding:24px;text-align:left}
.guarantee-box h3{font-size:17px;font-weight:700;margin-bottom:12px;text-align:center}
.guarantee-box ul{list-style:none;margin:0;padding:0}
.guarantee-box li{padding:6px 0;font-size:15px;color:#555}
.guarantee-box li:before{content:"\\2713 ";color:#2e7d32;font-weight:700;margin-right:6px}

/* ── 3-step visual ── */
.steps3{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:16px;align-items:start;margin-top:32px}
@media(max-width:720px){.steps3{grid-template-columns:1fr;gap:12px}.step3-arrow{display:none}}
.step3{background:#fff;border:1px solid #eee;border-radius:14px;padding:24px 20px 22px;text-align:center;position:relative;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.step3-icon{display:inline-flex;align-items:center;justify-content:center;width:68px;height:68px;border-radius:50%;background:#eaf3ff;color:#007bff;margin-bottom:12px}
.step3-num{position:absolute;top:14px;right:14px;width:26px;height:26px;border-radius:50%;background:#007bff;color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center}
.step3 h3{font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:8px}
.step3 p{font-size:14px;color:#555;line-height:1.5}
.step3-arrow{color:#c7d5ea;font-size:28px;align-self:center;padding-top:30px}

/* ── Phone mockup (hero) ── */
.phone-preview{margin:40px auto 0;max-width:360px;text-align:center}
.phone-frame{display:inline-block;padding:10px;background:linear-gradient(160deg,#2b2f36,#0c0f14);border-radius:38px;box-shadow:0 20px 50px rgba(0,0,0,.45),inset 0 0 0 1.5px rgba(255,255,255,.06)}
.phone-frame img{display:block;width:260px;height:auto;border-radius:28px;background:#fff}
@media(max-width:380px){.phone-frame img{width:220px}}
.phone-caption{margin-top:14px;font-size:13px;color:rgba(255,255,255,.55);line-height:1.5;max-width:300px;margin-left:auto;margin-right:auto}

/* ── Dark-section full page preview ── */
.page-preview-dark{margin:32px auto 0;max-width:360px;text-align:center}
.page-preview-dark figure{margin:0;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px}
.page-preview-dark img{display:block;width:100%;height:auto;border-radius:10px;background:#fff}
.page-preview-dark figcaption{margin-top:12px;font-size:13px;color:rgba(255,255,255,.55);line-height:1.5}

/* ── Product shot (dashboard mockups) ── */
.product-shot{margin:32px auto 0;max-width:780px;text-align:center}
.product-shot img{display:block;width:100%;height:auto;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.12);border:1px solid #e5e7eb;background:#fff}
.product-shot figcaption{margin-top:12px;font-size:13px;color:#6b7280;line-height:1.5}
.product-shot-dark img{border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 32px rgba(0,0,0,.4)}
.product-shot-dark figcaption{color:rgba(255,255,255,.55)}

/* ── Footer ── */
.sales-footer{background:#111;color:#fff;padding:32px 0;text-align:center;font-size:14px}
.sales-footer strong{font-size:16px}
.sales-footer p{color:rgba(255,255,255,.5);margin-top:4px}
`;

export default sales;
