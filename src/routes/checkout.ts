import { Hono } from "hono";
import type { Env } from "../lib/db";

const checkout = new Hono<{ Bindings: Env }>();

// ── GET /checkout — High-converting checkout page ──
checkout.get("/checkout", (c) => {
  return c.html(checkoutPage());
});

// ── GET /checkout/success — Post-payment success page ──
checkout.get("/checkout/success", (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to KnoqGen!</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Heebo',sans-serif;background:#f5f7fa;color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
    .card{background:#fff;border-radius:16px;padding:48px 32px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .check{width:64px;height:64px;background:#e8f5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
    h1{font-size:24px;font-weight:800;margin-bottom:8px;color:#2e7d32}
    p{font-size:16px;color:#555;line-height:1.5;margin-bottom:8px}
    .steps{text-align:left;margin:24px 0;background:#f8f9fa;border-radius:12px;padding:20px}
    .step{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #eee}
    .step:last-child{border-bottom:none}
    .step-n{width:28px;height:28px;background:#8145FC;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
    .step strong{font-size:14px;display:block;margin-bottom:2px}
    .step p{font-size:13px;color:#888;margin:0}
    .btn{display:inline-block;padding:14px 32px;background:#8145FC;color:#fff;font-size:16px;font-weight:700;border-radius:8px;text-decoration:none;margin-top:20px}
    .btn:hover{background:#391991}
    .sub{font-size:13px;color:#aaa;margin-top:12px}
  </style>
</head>
<body>
  <div class="card">
    <div class="check">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1>You're In!</h1>
    <p>Your KnoqGen subscription is active.</p>
    <p>Here's how to get started:</p>

    <div class="steps">
      <div class="step">
        <div class="step-n">1</div>
        <div>
          <strong>We'll set up your account</strong>
          <p>You'll get a login email within the next few hours.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-n">2</div>
        <div>
          <strong>Add your reps</strong>
          <p>Share the login with your sales team.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-n">3</div>
        <div>
          <strong>Start knocking</strong>
          <p>Record a video, print a QR, leave it at the door. Leads start coming in.</p>
        </div>
      </div>
    </div>

    <p style="font-size:15px;color:#333"><strong>Questions?</strong> Reply to your confirmation email or reach out anytime.</p>

    <a href="/sell" class="btn">Back to Home</a>
    <p class="sub">A receipt has been sent to your email via Stripe.</p>
  </div>
</body>
</html>`);
});

function checkoutPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Start KnoqGen &mdash; Checkout</title>
  <meta name="description" content="Get your team set up with KnoqGen. $199/mo, includes 3 reps. Turn missed doors into leads starting today.">
  <meta property="og:title" content="Start KnoqGen &mdash; Checkout">
  <meta property="og:description" content="$199/mo, includes 3 reps. Turn missed doors into leads starting today.">
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
  <style>${CHECKOUT_CSS}</style>
</head>
<body>

<!-- ═══ HEADER ═══ -->
<header class="ch-header">
  <div class="ch-container">
    <a href="/sell" class="ch-logo" style="display:flex;align-items:center"><img src="/logo.png" alt="KnoqGen" style="height:56px;width:auto"></a>
    <div class="ch-secure">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Secure Checkout
    </div>
  </div>
</header>

<main class="ch-main">
  <div class="ch-container">

    <!-- ═══ HEADLINE ═══ -->
    <div class="ch-hero">
      <h1>Get Your Team Started With KnoqGen</h1>
      <p>Turn missed doors into leads in minutes &mdash; not weeks.</p>
    </div>

    <!-- ═══ TRIAL BANNER ═══ -->
    <div class="ch-trial-banner">
      <div class="ch-trial-copy">
        <strong>Not ready to commit?</strong>
        <span>Try the full product free for 14 days. No credit card required.</span>
      </div>
      <a href="/trial" class="ch-trial-btn">Start Free Trial &rarr;</a>
    </div>

    <div class="ch-layout">

      <!-- ═══════════════════════════════════ -->
      <!-- LEFT: PLAN SELECTION + FORM -->
      <!-- ═══════════════════════════════════ -->
      <div class="ch-form-col">

        <!-- PLAN SELECTION -->
        <div class="ch-section">
          <h2 class="ch-section-title">1. Choose Your Plan</h2>

          <div class="plan-options">
            <!-- ANNUAL (default, recommended) -->
            <label class="plan-card plan-card-best selected" id="planAnnual">
              <input type="radio" name="plan" value="annual" checked>
              <div class="plan-badge">Best Value &mdash; Save 2 Months</div>
              <div class="plan-top">
                <div class="plan-name">Annual</div>
                <div class="plan-price">$1,990<span>/yr</span></div>
              </div>
              <div class="plan-detail">That's $165.83/mo &mdash; <strong>save $398</strong></div>
              <div class="plan-includes">Includes 3 reps &middot; Unlimited pages &middot; All features</div>
            </label>

            <!-- MONTHLY -->
            <label class="plan-card" id="planMonthly">
              <input type="radio" name="plan" value="monthly">
              <div class="plan-top">
                <div class="plan-name">Monthly</div>
                <div class="plan-price">$199<span>/mo</span></div>
              </div>
              <div class="plan-detail">Flexible &mdash; cancel anytime</div>
              <div class="plan-includes">Includes 3 reps &middot; Unlimited pages &middot; All features</div>
            </label>
          </div>

          <!-- EXTRA REPS -->
          <div class="addon-row">
            <div>
              <strong>Need more than 3 reps?</strong>
              <p class="addon-sub">$40/mo per additional rep on the monthly plan, $400/yr on the annual plan. You can add more anytime from your dashboard.</p>
            </div>
            <div class="addon-stepper">
              <button type="button" class="stepper-btn" id="repMinus">&minus;</button>
              <span class="stepper-val" id="repCount">0</span>
              <button type="button" class="stepper-btn" id="repPlus">+</button>
            </div>
          </div>
        </div>

        <!-- ACCOUNT INFO -->
        <div class="ch-section">
          <h2 class="ch-section-title">2. Your Info</h2>
          <form id="checkoutForm">
            <div class="field-row">
              <div class="field">
                <label for="fname">First Name</label>
                <input type="text" id="fname" required autocomplete="given-name" placeholder="Jane">
              </div>
              <div class="field">
                <label for="lname">Last Name</label>
                <input type="text" id="lname" required autocomplete="family-name" placeholder="Smith">
              </div>
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input type="email" id="email" required autocomplete="email" placeholder="you@yourcompany.com">
              <span class="field-hint">This is where you'll log in and receive lead notifications</span>
            </div>
            <div class="field">
              <label for="company">Company Name</label>
              <input type="text" id="company" required placeholder="e.g. ABC Painting, Summit Roofing">
            </div>
            <div class="field">
              <label for="phone">Phone <span class="optional">(optional)</span></label>
              <input type="tel" id="phone" autocomplete="tel" placeholder="(208) 555-1234">
            </div>

            <!-- SUBMIT — payment handled by Stripe Checkout -->
            <div class="payment-secure-note" style="margin-top:24px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              You'll enter payment info on the next page via Stripe's secure checkout.
            </div>

            <button type="submit" class="btn-checkout" id="submitBtn">
              <span id="btnText">Continue to Payment</span>
              <span id="btnPrice">&mdash; <span id="btnTotal">$1,990</span></span>
            </button>

            <div class="post-btn-trust">
              <p><strong>One extra job can pay for this many times over.</strong></p>
              <p style="margin-top:6px">Cancel anytime &middot; No contracts &middot; No setup fees</p>
            </div>
          </form>
        </div>
      </div>

      <!-- ═══════════════════════════════════ -->
      <!-- RIGHT: ORDER SUMMARY + TRUST -->
      <!-- ═══════════════════════════════════ -->
      <div class="ch-summary-col">

        <!-- ORDER SUMMARY -->
        <div class="summary-card">
          <h3>Order Summary</h3>
          <div class="summary-line">
            <span id="summaryPlan">Annual Plan</span>
            <strong id="summaryPlanPrice">$1,990/yr</strong>
          </div>
          <div class="summary-line" id="summaryRepsRow" style="display:none">
            <span id="summaryRepsLabel">Extra reps (0)</span>
            <strong id="summaryRepsPrice">$0</strong>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-line summary-total">
            <span>Due today</span>
            <strong id="summaryTotal">$1,990</strong>
          </div>

          <div class="summary-includes">
            <p class="summary-inc-title">Includes:</p>
            <ul>
              <li>3 sales reps</li>
              <li>Unlimited landing pages</li>
              <li>Unlimited video uploads</li>
              <li>QR code generation + printing</li>
              <li>Lead notifications by email</li>
              <li>Admin dashboard + analytics</li>
              <li>Lead status tracking</li>
            </ul>
          </div>
        </div>

        <!-- LANDING PAGE PREVIEW -->
        <div class="preview-block">
          <div class="preview-label">What your homeowners will see</div>
          <div class="preview-phone">
            <img src="/landing-hero-mobile.png" alt="Example KnoqGen landing page — personalized video from a rep with a Get a Free Quote button." loading="lazy" width="260" height="555">
          </div>
          <p class="preview-caption">A real rep. A real message. One-tap quote request.</p>
        </div>

        <!-- TRUST BLOCK -->
        <div class="trust-block">
          <div class="trust-item-h">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>Cancel anytime. No contracts.</span>
          </div>
          <div class="trust-item-h">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>Set up in 10 minutes.</span>
          </div>
          <div class="trust-item-h">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>Works with your current sales team.</span>
          </div>
          <div class="trust-item-h">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>No app to download. No training needed.</span>
          </div>
          <div class="trust-item-h">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>One extra job pays for a full year.</span>
          </div>
        </div>

        <!-- MINI FAQ -->
        <div class="mini-faq">
          <h3>Quick Questions</h3>
          <div class="mfaq">
            <strong>How fast can we start?</strong>
            <p>10 minutes. Sign up, have a rep record a video, and you've got a live page with a QR code.</p>
          </div>
          <div class="mfaq">
            <strong>What if my reps aren't techy?</strong>
            <p>If they can record a video on their phone, they can use this. One screen, one button.</p>
          </div>
          <div class="mfaq">
            <strong>Can I add reps later?</strong>
            <p>Yes. Add or remove reps anytime from your dashboard. $40/mo each on the monthly plan ($400/yr on annual).</p>
          </div>
          <div class="mfaq">
            <strong>Do I need to change my current process?</strong>
            <p>No. Your reps still knock doors the same way. This just gives them something better to leave behind.</p>
          </div>
          <div class="mfaq">
            <strong>What if this only gets me one extra job?</strong>
            <p>Then it already paid for itself. One paint job is $3K+. One roof is $8K+. This costs $199/mo.</p>
          </div>
        </div>
      </div>

    </div><!-- /ch-layout -->

    <!-- ═══ WHAT HAPPENS NEXT ═══ -->
    <div class="next-steps">
      <h3>After You Sign Up</h3>
      <figure class="ch-product-shot">
        <img src="/dashboard-home.svg" alt="KnoqGen rep dashboard with weekly stats and recent pages." loading="lazy" width="800" height="560">
        <figcaption>Your dashboard, day one.</figcaption>
      </figure>
      <div class="next-grid">
        <div class="next-item">
          <div class="next-num">1</div>
          <div>
            <strong>Create your account</strong>
            <p>Takes 30 seconds. We'll set up your company dashboard.</p>
          </div>
        </div>
        <div class="next-item">
          <div class="next-num">2</div>
          <div>
            <strong>Add your reps</strong>
            <p>Share the login with your team. They can start creating pages immediately.</p>
          </div>
        </div>
        <div class="next-item">
          <div class="next-num">3</div>
          <div>
            <strong>Use it on your next route</strong>
            <p>Record a video, print a QR sticker, leave it at the door. Leads start coming in.</p>
          </div>
        </div>
      </div>
    </div>

  </div><!-- /ch-container -->
</main>

<footer class="ch-footer">
  <div class="ch-container">
    <p>KnoqGen &middot; Turn missed doors into booked jobs.</p>
    <p style="margin-top:4px">&copy; 2026 KnoqGen. All rights reserved.</p>
  </div>
</footer>

<script>
(function(){
  var annual = document.getElementById('planAnnual');
  var monthly = document.getElementById('planMonthly');
  var repCount = 0;
  var isAnnual = true;

  // Plan selection
  annual.addEventListener('click', function(){ setPlan(true); });
  monthly.addEventListener('click', function(){ setPlan(false); });

  function setPlan(a){
    isAnnual = a;
    annual.classList.toggle('selected', a);
    monthly.classList.toggle('selected', !a);
    updateSummary();
  }

  // Rep stepper
  document.getElementById('repPlus').addEventListener('click', function(){
    repCount++;
    updateSummary();
  });
  document.getElementById('repMinus').addEventListener('click', function(){
    if(repCount > 0) repCount--;
    updateSummary();
  });

  function updateSummary(){
    document.getElementById('repCount').textContent = repCount;

    var baseName, basePrice, baseDisplay;
    if(isAnnual){
      baseName = 'Annual Plan';
      basePrice = 1990;
      baseDisplay = '$1,990/yr';
    } else {
      baseName = 'Monthly Plan';
      basePrice = 199;
      baseDisplay = '$199/mo';
    }

    document.getElementById('summaryPlan').textContent = baseName;
    document.getElementById('summaryPlanPrice').textContent = baseDisplay;

    var repsRow = document.getElementById('summaryRepsRow');
    var repsCost = repCount * 40;            // monthly: $40/mo per extra rep
    if(isAnnual) repsCost = repCount * 400;  // annual:  $400/yr per extra rep

    if(repCount > 0){
      repsRow.style.display = 'flex';
      document.getElementById('summaryRepsLabel').textContent = repCount + ' extra rep' + (repCount > 1 ? 's' : '') + (isAnnual ? ' (annual)' : ' (/mo)');
      document.getElementById('summaryRepsPrice').textContent = '$' + repsCost;
    } else {
      repsRow.style.display = 'none';
    }

    var total = basePrice + repsCost;
    document.getElementById('summaryTotal').textContent = '$' + total.toLocaleString();
    document.getElementById('btnTotal').textContent = '$' + total.toLocaleString();
    document.getElementById('btnText').textContent = isAnnual ? 'Start My Subscription' : 'Start My Subscription';
  }

  // Stripe Checkout
  document.getElementById('checkoutForm').addEventListener('submit', function(e){
    e.preventDefault();
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    document.getElementById('btnText').textContent = 'Redirecting to checkout...';
    document.getElementById('btnPrice').style.display = 'none';

    var body = {
      plan: isAnnual ? 'annual' : 'monthly',
      email: document.getElementById('email').value.trim(),
      company: document.getElementById('company').value.trim(),
      extra_reps: repCount
    };

    fetch('/api/checkout', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data.url){
        window.location.href = data.url;
      } else {
        alert('Something went wrong: ' + (data.error || 'Please try again.'));
        btn.disabled = false;
        document.getElementById('btnText').textContent = 'Start My Subscription';
        document.getElementById('btnPrice').style.display = '';
      }
    })
    .catch(function(){
      alert('Connection error. Please try again.');
      btn.disabled = false;
      document.getElementById('btnText').textContent = 'Start My Subscription';
      document.getElementById('btnPrice').style.display = '';
    });
  });
})();
</script>

</body>
</html>`;
}

const CHECKOUT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Heebo',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a1a;background:#f5f7fa;-webkit-font-smoothing:antialiased}
.ch-container{max-width:960px;margin:0 auto;padding:0 20px}

/* ── Header ── */
.ch-header{background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 0}
.ch-header .ch-container{display:flex;justify-content:space-between;align-items:center}
.ch-logo{font-size:17px;font-weight:800;color:#1a1a1a;text-decoration:none}
.ch-secure{font-size:13px;color:#2e7d32;font-weight:600;display:flex;align-items:center;gap:5px}

/* ── Main ── */
.ch-main{padding:28px 0 48px}
.ch-hero{text-align:center;margin-bottom:28px}
.ch-hero h1{font-size:26px;font-weight:800;color:#111;margin-bottom:6px}
.ch-hero p{font-size:15px;color:#888}

/* ── Two-column layout (stacks on mobile) ── */
.ch-layout{display:grid;grid-template-columns:1fr 360px;gap:24px;align-items:start}
@media(max-width:800px){.ch-layout{grid-template-columns:1fr}}

/* ── Sections ── */
.ch-section{background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.ch-section-title{font-size:16px;font-weight:700;color:#111;margin-bottom:16px}

/* ── Plan cards ── */
.plan-options{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
.plan-card{position:relative;border:2px solid #e5e7eb;border-radius:10px;padding:16px;cursor:pointer;transition:border-color .15s}
.plan-card:hover{border-color:#8145FC}
.plan-card.selected{border-color:#8145FC;background:#f0f7ff}
.plan-card-best{padding-top:28px}
.plan-badge{position:absolute;top:-1px;left:16px;background:#8145FC;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:0 0 6px 6px;text-transform:uppercase;letter-spacing:.5px}
.plan-card input[type="radio"]{display:none}
.plan-top{display:flex;justify-content:space-between;align-items:baseline}
.plan-name{font-size:16px;font-weight:700}
.plan-price{font-size:24px;font-weight:800}
.plan-price span{font-size:14px;font-weight:500;color:#888}
.plan-detail{font-size:13px;color:#8145FC;font-weight:600;margin-top:4px}
.plan-card:not(.plan-card-best) .plan-detail{color:#888}
.plan-includes{font-size:12px;color:#aaa;margin-top:6px}

/* ── Addon stepper ── */
.addon-row{display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;border-radius:10px;padding:14px 16px;gap:16px}
.addon-row strong{font-size:14px}
.addon-sub{font-size:12px;color:#888;margin-top:2px}
.addon-stepper{display:flex;align-items:center;gap:8px}
.stepper-btn{width:32px;height:32px;border:1.5px solid #ddd;border-radius:8px;background:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#333}
.stepper-btn:hover{border-color:#8145FC;color:#8145FC}
.stepper-val{font-size:17px;font-weight:700;min-width:20px;text-align:center}

/* ── Form fields ── */
.field{margin-bottom:14px}
.field label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px}
.field input{width:100%;padding:11px 12px;font-size:16px;font-family:'Heebo',sans-serif;border:1.5px solid #ddd;border-radius:8px;background:#fff;-webkit-appearance:none}
.field input:focus{outline:none;border-color:#8145FC;box-shadow:0 0 0 3px rgba(129,69,252,.1)}
.field-hint{font-size:12px;color:#aaa;margin-top:3px;display:block}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.optional{color:#aaa;font-weight:400}
.payment-secure-note{font-size:12px;color:#2e7d32;display:flex;align-items:center;gap:6px;margin-bottom:16px;background:#f0fdf4;padding:10px 12px;border-radius:8px}

/* ── Checkout button ── */
.btn-checkout{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:16px;background:#8145FC;color:#fff;font-size:17px;font-weight:700;font-family:'Heebo',sans-serif;border:none;border-radius:8px;cursor:pointer;transition:background .2s;margin-top:4px}
.btn-checkout:hover{background:#391991}
.btn-checkout:disabled{background:#C6ADFF;cursor:not-allowed}
.btn-checkout #btnPrice{font-weight:500;opacity:.8}
.post-btn-trust{text-align:center;margin-top:12px;font-size:13px;color:#888;line-height:1.5}

/* ── Order summary ── */
.summary-card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:16px}
.summary-card h3{font-size:15px;font-weight:700;margin-bottom:14px}
.summary-line{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#555}
.summary-line strong{color:#1a1a1a}
.summary-total{font-size:17px;padding:10px 0 0;color:#1a1a1a}
.summary-total strong{font-size:20px;color:#8145FC}
.summary-divider{height:1px;background:#eee;margin:8px 0}
.summary-includes{margin-top:16px;padding-top:16px;border-top:1px solid #eee}
.summary-inc-title{font-size:12px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.summary-includes ul{list-style:none}
.summary-includes li{font-size:13px;color:#555;padding:3px 0}
.summary-includes li:before{content:"\\2713 ";color:#2e7d32;font-weight:700;margin-right:4px}

/* ── Landing preview (sidebar) ── */
.preview-block{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:16px;text-align:center}
.preview-label{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:12px}
.preview-phone{display:inline-block;padding:8px;background:linear-gradient(160deg,#2b2f36,#0c0f14);border-radius:28px;box-shadow:0 12px 28px rgba(0,0,0,.25)}
.preview-phone img{display:block;width:180px;height:auto;border-radius:20px;background:#fff}
.preview-caption{margin-top:12px;font-size:12px;color:#666;line-height:1.5}

/* ── Checkout product shot ── */
.ch-product-shot{margin:0 auto 24px;max-width:720px}
.ch-product-shot img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid #e5e7eb;box-shadow:0 8px 24px rgba(15,23,42,.08);background:#fff}
.ch-product-shot figcaption{margin-top:8px;font-size:12px;color:#888;text-align:center}

/* ── Trust block ── */
.trust-block{background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:16px}
.trust-item-h{display:flex;align-items:center;gap:8px;font-size:14px;color:#333;padding:5px 0}

/* ── Mini FAQ ── */
.mini-faq{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.mini-faq h3{font-size:15px;font-weight:700;margin-bottom:12px}
.mfaq{margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f0f0f0}
.mfaq:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}
.mfaq strong{font-size:14px;color:#1a1a1a;display:block;margin-bottom:3px}
.mfaq p{font-size:13px;color:#888;line-height:1.5}

/* ── Next steps ── */
.next-steps{margin-top:32px;text-align:center}
.next-steps h3{font-size:18px;font-weight:700;margin-bottom:20px;color:#111}
.next-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:600px){.next-grid{grid-template-columns:1fr}}
.next-item{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.06);display:flex;gap:12px;text-align:left}
.next-num{width:28px;height:28px;background:#8145FC;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0}
.next-item strong{font-size:14px;display:block;margin-bottom:2px}
.next-item p{font-size:13px;color:#888;line-height:1.4}

/* ── Footer ── */
.ch-footer{padding:24px 0;text-align:center;font-size:12px;color:#aaa}

/* ── Trial banner (top of checkout) ── */
.ch-trial-banner{display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(135deg,#e8f5e9,#f0f9ff);border:1px solid #c8e6c9;border-radius:12px;padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.ch-trial-copy{display:flex;flex-direction:column;gap:2px;font-size:14px}
.ch-trial-copy strong{color:#111;font-weight:700;font-size:15px}
.ch-trial-copy span{color:#555}
.ch-trial-btn{flex-shrink:0;display:inline-block;padding:10px 18px;background:#2e7d32;color:#fff;font-size:14px;font-weight:700;border-radius:8px;text-decoration:none;white-space:nowrap;transition:background .15s}
.ch-trial-btn:hover{background:#1b5e20}
@media(max-width:600px){.ch-trial-banner{flex-direction:column;align-items:flex-start;gap:10px}.ch-trial-btn{width:100%;text-align:center}}
`;

export default checkout;
