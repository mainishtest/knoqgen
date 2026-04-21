// Hardware order flow — branded checkout page for the Leave-Behind System
// GET  /hardware/order?trial_id=XXX&qty=N  → branded payment page
// POST /api/hardware/intent                 → creates Stripe PaymentIntent, returns client_secret

import { Hono } from "hono";
import type { Env } from "../lib/db";
import { getDb } from "../lib/db";

const hw = new Hono<{ Bindings: Env }>();

// ── GET /hardware/order — branded order page ──
hw.get("/hardware/order", async (c) => {
  const trialId = c.req.query("trial_id") || "";
  const qty = Math.max(1, Math.min(10, parseInt(c.req.query("qty") || "1", 10)));

  if (!trialId || !/^[0-9a-f-]{36}$/i.test(trialId)) {
    return c.redirect("/trial");
  }

  // Look up trial so we can pre-fill email
  const sql = getDb(c.env);
  const rows = await sql`SELECT email, name, company FROM trial_signups WHERE id = ${trialId}` as Array<{
    email: string; name: string; company: string;
  }>;
  const trial = rows[0] ?? null;

  const unitPrice = 99;
  const total = unitPrice * qty;
  const pubKey = c.env.STRIPE_PUBLISHABLE_KEY || "";
  const siteUrl = c.env.SITE_URL || "https://knoqgen.com";

  return c.html(orderPage({
    trialId,
    qty,
    unitPrice,
    total,
    prefillEmail: trial?.email ?? "",
    prefillName: trial?.name ?? "",
    pubKey,
    siteUrl,
  }));
});

// ── POST /api/hardware/intent — create Stripe PaymentIntent ──
hw.post("/api/hardware/intent", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid request" }, 400); }

  const trialId = (body.trial_id || "").toString().trim();
  const qty = Math.max(1, Math.min(10, parseInt(body.qty || "1", 10)));
  const shippingName = (body.shipping_name || "").toString().trim();
  const shippingEmail = (body.shipping_email || "").toString().trim().toLowerCase();
  const shippingAddress = body.shipping_address || {};

  if (!trialId || !/^[0-9a-f-]{36}$/i.test(trialId)) {
    return c.json({ error: "Invalid trial ID" }, 400);
  }
  if (!shippingName || !shippingEmail) {
    return c.json({ error: "Name and email are required" }, 400);
  }
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Stripe not configured" }, 500);
  }

  const unitCents = 9900;
  const totalCents = unitCents * qty;

  const params = new URLSearchParams();
  params.set("amount", String(totalCents));
  params.set("currency", "usd");
  params.set("description", `Leave-Behind System × ${qty}`);
  params.set("receipt_email", shippingEmail);
  params.set("metadata[type]", "hardware");
  params.set("metadata[trial_id]", trialId);
  params.set("metadata[qty]", String(qty));
  params.set("metadata[sku]", "printer-bundle-v1");
  params.set("metadata[shipping_name]", shippingName);
  params.set("metadata[shipping_email]", shippingEmail);
  params.set("metadata[shipping_address]", JSON.stringify(shippingAddress));
  params.set("shipping[name]", shippingName);
  if (shippingAddress.line1)       params.set("shipping[address][line1]", shippingAddress.line1);
  if (shippingAddress.line2)       params.set("shipping[address][line2]", shippingAddress.line2 || "");
  if (shippingAddress.city)        params.set("shipping[address][city]", shippingAddress.city);
  if (shippingAddress.state)       params.set("shipping[address][state]", shippingAddress.state);
  if (shippingAddress.postal_code) params.set("shipping[address][postal_code]", shippingAddress.postal_code);
  params.set("shipping[address][country]", "US");
  params.set("automatic_payment_methods[enabled]", "true");

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const pi = await res.json() as { id?: string; client_secret?: string; error?: { message: string } };
  if (!res.ok || !pi.client_secret) {
    return c.json({ error: pi.error?.message || "Could not initialize payment" }, 500);
  }

  return c.json({ ok: true, client_secret: pi.client_secret });
});

// ── Page template ──
function orderPage(opts: {
  trialId: string;
  qty: number;
  unitPrice: number;
  total: number;
  prefillEmail: string;
  prefillName: string;
  pubKey: string;
  siteUrl: string;
}): string {
  const { trialId, qty, unitPrice, total, prefillEmail, prefillName, pubKey, siteUrl } = opts;
  const successUrl = `${siteUrl}/trial/setup?id=${encodeURIComponent(trialId)}&bundle=1`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Order &mdash; Leave-Behind System</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Heebo',sans-serif;background:#f0f4f8;color:#1a1a1a;min-height:100vh}
    a{color:#8145FC;text-decoration:none}
    a:hover{text-decoration:underline}

    /* Header */
    .hw-header{background:#0f172a;padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
    .hw-logo{height:30px;width:auto;filter:brightness(0) invert(1)}
    .hw-secure{display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,.7);font-weight:500}
    .hw-secure svg{color:#4ade80}

    /* Layout */
    .hw-body{max-width:1000px;margin:0 auto;padding:32px 20px 64px;display:grid;grid-template-columns:1fr 420px;gap:28px;align-items:start}
    @media(max-width:780px){.hw-body{grid-template-columns:1fr;gap:20px}}

    /* ── Order summary card ── */
    .hw-summary{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)}

    /* Hero image block */
    .hw-hero{position:relative;background:#0f172a;overflow:hidden}
    .hw-hero-img{width:100%;display:block;max-height:480px;object-fit:cover;object-position:center center}
    .hw-hero-overlay{position:absolute;bottom:0;left:0;right:0;padding:16px 20px;background:linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 100%)}
    .hw-hero-tag{display:inline-block;background:#8145FC;color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:3px 8px;border-radius:4px;margin-bottom:6px}
    .hw-hero-title{font-size:20px;font-weight:900;color:#fff;line-height:1.2}
    .hw-hero-sub{font-size:13px;color:rgba(255,255,255,.75);margin-top:4px}

    /* Hook bar */
    .hw-hook-bar{background:#1e3a5f;padding:12px 20px;display:flex;align-items:center;gap:10px}
    .hw-hook-bar span{font-size:13px;color:#e2e8f0;line-height:1.45}
    .hw-hook-bar strong{color:#fff}

    /* Includes list */
    .hw-includes-wrap{padding:18px 20px 4px}
    .hw-includes-label{font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px}
    .hw-includes-list{list-style:none}
    .hw-includes-list li{display:flex;gap:10px;align-items:flex-start;padding:6px 0;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9}
    .hw-includes-list li:last-child{border-bottom:none}
    .hw-check{width:18px;height:18px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
    .hw-check svg{color:#16a34a}

    /* ROI callout */
    .hw-roi{margin:12px 20px;padding:12px 16px;background:linear-gradient(135deg,#fef9c3,#fef08a);border-radius:10px;border-left:4px solid #f59e0b}
    .hw-roi p{font-size:13px;color:#713f12;font-weight:600;line-height:1.4}

    /* Price summary */
    .hw-price-block{padding:14px 20px 0}
    .hw-line{display:flex;justify-content:space-between;padding:7px 0;font-size:14px;color:#64748b;border-top:1px solid #f1f5f9}
    .hw-line.total{font-size:18px;font-weight:900;color:#0f172a;border-top:2px solid #0f172a;margin-top:4px;padding-top:12px}

    /* Guarantee */
    .hw-guarantee{display:flex;gap:12px;align-items:flex-start;margin:16px 20px 20px;padding:14px 16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0}
    .hw-guarantee-icon{font-size:24px;flex-shrink:0}
    .hw-guarantee p{font-size:12px;color:#166534;line-height:1.5}

    /* Warranty */
    .hw-warranty{display:flex;gap:12px;align-items:flex-start;margin:0 20px 16px;padding:12px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0}
    .hw-warranty-icon{font-size:20px;flex-shrink:0;margin-top:1px}
    .hw-warranty-title{font-size:12px;font-weight:700;color:#1e293b;margin-bottom:3px}
    .hw-warranty-body{font-size:11px;color:#64748b;line-height:1.5}

    /* Trust badges */
    .hw-badges{display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 20px}
    .hw-badge{display:flex;align-items:center;gap:5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;font-size:11px;color:#475569;font-weight:600}

    /* ── Payment form ── */
    .hw-form-card{background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 4px 20px rgba(0,0,0,.10)}
    .hw-form-header{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f1f5f9}
    .hw-form-header h2{font-size:19px;font-weight:900;color:#0f172a;margin-bottom:4px}
    .hw-form-header p{font-size:13px;color:#64748b}
    .hw-section-label{font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 10px}
    .hw-field{margin-bottom:14px}
    .hw-field label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px}
    .hw-field input,.hw-field select{width:100%;padding:11px 13px;font-size:15px;font-family:'Heebo',sans-serif;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#111;transition:border-color .15s,box-shadow .15s}
    .hw-field input:focus,.hw-field select:focus{outline:none;border-color:#8145FC;box-shadow:0 0 0 3px rgba(129,69,252,.12)}
    .hw-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .hw-row-3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
    #payment-element{border:1.5px solid #d1d5db;border-radius:8px;padding:12px;margin-top:4px;background:#fff}
    .hw-btn{display:block;width:100%;padding:17px;background:linear-gradient(135deg,#8145FC,#0056b3);color:#fff;font-size:16px;font-weight:800;font-family:'Heebo',sans-serif;border:none;border-radius:10px;cursor:pointer;margin-top:20px;transition:opacity .15s,transform .1s;text-align:center;letter-spacing:.01em}
    .hw-btn:hover{opacity:.93}
    .hw-btn:active{transform:scale(.99)}
    .hw-btn:disabled{background:#93c5fd;cursor:not-allowed;transform:none}
    .hw-btn-sub{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#94a3b8}
    .hw-error{margin-top:12px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#b91c1c;font-size:13px;display:none}
    .hw-fine{text-align:center;font-size:11px;color:#94a3b8;margin-top:14px;line-height:1.7}
    .hw-loading{display:none;text-align:center;padding:30px;color:#64748b;font-size:14px}

    @media(max-width:780px){.hw-row,.hw-row-3{grid-template-columns:1fr}.hw-badges{gap:6px}}
  </style>
</head>
<body>

<header class="hw-header">
  <a href="/sell"><img src="/logo.png" alt="KnoqGen" class="hw-logo" onerror="this.style.display='none'"></a>
  <div class="hw-secure">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    256-bit SSL encrypted checkout
  </div>
</header>

<div class="hw-body">

  <!-- LEFT: order summary -->
  <div class="hw-summary">

    <!-- Hero product image -->
    <div class="hw-hero">
      <img src="/leave-behind-system.png" alt="Leave-Behind System — Portable QR Printer Bundle" class="hw-hero-img">
      <div class="hw-hero-overlay">
        <div class="hw-hero-tag">One-time add-on</div>
        <div class="hw-hero-title">Leave-Behind System</div>
        <div class="hw-hero-sub">Print • Stick • Walk Away with the Lead</div>
      </div>
    </div>

    <!-- Hook bar -->
    <div class="hw-hook-bar">
      <span>Most doors don't answer. <strong>This one still gets you the lead.</strong> Every door you visit becomes a lead opportunity — answered or not.</span>
    </div>

    <!-- What's included -->
    <div class="hw-includes-wrap">
      <div class="hw-includes-label">What's included</div>
      <ul class="hw-includes-list">
        <li>
          <span class="hw-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg></span>
          <span><strong>Portable Bluetooth thermal printer</strong> — pocket-sized, no ink, no cords. Pairs in 30 seconds.</span>
        </li>
        <li>
          <span class="hw-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg></span>
          <span><strong>2× label rolls</strong> — 500 QR stickers ready to deploy from day one.</span>
        </li>
        <li>
          <span class="hw-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg></span>
          <span><strong>Zero setup</strong> — works natively with KnoqGen. Print from the app in seconds.</span>
        </li>
        <li>
          <span class="hw-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg></span>
          <span><strong>Door hanger cards</strong> — professional leave-behinds that get picked up and scanned.</span>
        </li>
      </ul>
    </div>

    <!-- ROI callout -->
    <div class="hw-roi">
      <p>⚡ One job from a leave-behind covers this investment <strong>15× over.</strong> That's not marketing math — that's a $1,500 job from a $99 sticker.</p>
    </div>

    <!-- Price lines -->
    <div class="hw-price-block">
      <div class="hw-line"><span>Leave-Behind System × ${qty}</span><span>$${unitPrice} each</span></div>
      ${qty > 1 ? `<div class="hw-line"><span>Subtotal</span><span>$${total}</span></div>` : ""}
      <div class="hw-line"><span>Shipping</span><span style="color:#16a34a;font-weight:600">Free</span></div>
      <div class="hw-line total"><span>Total today</span><span>$${total}</span></div>
    </div>

    <!-- Guarantee -->
    <div class="hw-guarantee">
      <div class="hw-guarantee-icon">🛡️</div>
      <p><strong>30-day satisfaction guarantee.</strong> If you're not capturing more leads within 30 days, contact us for a full refund — no questions, no hassle.</p>
    </div>

    <!-- Warranty -->
    <div class="hw-warranty">
      <div class="hw-warranty-icon">🔧</div>
      <div>
        <div class="hw-warranty-title">1-Year Manufacturer Warranty</div>
        <div class="hw-warranty-body">Hardware covered against manufacturing defects for 12 months from activation (print head: 3 months). Backed by Niimbot — contact service@niimbot.com to claim.</div>
      </div>
    </div>

    <!-- Trust badges -->
    <div class="hw-badges">
      <div class="hw-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Secure payment
      </div>
      <div class="hw-badge">🚚 Ships in 3–5 days</div>
      <div class="hw-badge">🇺🇸 Ships from USA</div>
      <div class="hw-badge">🔧 1-yr warranty</div>
    </div>
  </div>

  <!-- RIGHT: payment form -->
  <div class="hw-form-card">
    <div class="hw-form-header">
      <h2>Complete Your Order</h2>
      <p>Enter your shipping details and payment below.</p>
    </div>

    <form id="orderForm" novalidate>

      <p class="hw-section-label">Shipping information</p>

      <div class="hw-field">
        <label>Full name</label>
        <input id="shippingName" type="text" autocomplete="name" placeholder="Jane Smith" value="${prefillName.replace(/"/g, "&quot;")}" required>
      </div>
      <div class="hw-field">
        <label>Email</label>
        <input id="shippingEmail" type="email" autocomplete="email" placeholder="jane@yourcompany.com" value="${prefillEmail.replace(/"/g, "&quot;")}" required>
      </div>
      <div class="hw-field">
        <label>Street address</label>
        <input id="addrLine1" type="text" autocomplete="address-line1" placeholder="123 Main St" required>
      </div>
      <div class="hw-field">
        <label>Apt, suite, etc. <span style="color:#aaa;font-weight:400">(optional)</span></label>
        <input id="addrLine2" type="text" autocomplete="address-line2" placeholder="Apt 4B">
      </div>
      <div class="hw-row-3">
        <div class="hw-field">
          <label>City</label>
          <input id="addrCity" type="text" autocomplete="address-level2" placeholder="Boise" required>
        </div>
        <div class="hw-field">
          <label>State</label>
          <select id="addrState" autocomplete="address-level1" required>
            <option value="">—</option>
            ${US_STATES}
          </select>
        </div>
        <div class="hw-field">
          <label>ZIP</label>
          <input id="addrZip" type="text" autocomplete="postal-code" placeholder="83701" maxlength="10" required>
        </div>
      </div>

      <p class="hw-section-label">Payment</p>
      <div id="payment-element"></div>

      <div id="orderError" class="hw-error"></div>
      <button type="submit" id="submitBtn" class="hw-btn">
        🔒 Place My Order — $${total}
      </button>
      <div class="hw-btn-sub">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Encrypted &amp; secure • Powered by Stripe
      </div>
      <p class="hw-fine">
        Card details handled by Stripe — we never see or store your card number.<br>
        By placing your order you agree to our <a href="/sell">terms</a> and <a href="/sell">refund policy</a>.
      </p>
    </form>

    <div id="loadingMsg" class="hw-loading">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8145FC" stroke-width="2.5" style="animation:spin 1s linear infinite;margin-bottom:8px"><circle cx="12" cy="12" r="10" stroke-opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/></svg><br>
      Processing your payment…
    </div>
  </div>

  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>

</div>

<script>
(function(){
  var TRIAL_ID = ${JSON.stringify(trialId)};
  var QTY      = ${qty};
  var SUCCESS_URL = ${JSON.stringify(successUrl)};
  var PUB_KEY  = ${JSON.stringify(pubKey)};

  if (!PUB_KEY) {
    document.getElementById('orderError').textContent = 'Checkout is not configured. Please contact support.';
    document.getElementById('orderError').style.display = 'block';
    return;
  }

  var stripe = Stripe(PUB_KEY);
  var elements;
  var clientSecret = null;

  // Create PaymentIntent as soon as shipping fields are filled (or on first blur)
  // We'll create it on form submit to include the address
  var form      = document.getElementById('orderForm');
  var submitBtn = document.getElementById('submitBtn');
  var errBox    = document.getElementById('orderError');
  var loading   = document.getElementById('loadingMsg');

  function showErr(msg) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Complete Order — $' + (99 * QTY);
    loading.style.display = 'none';
    form.style.display = 'block';
  }
  function clearErr() { errBox.style.display = 'none'; errBox.textContent = ''; }

  // Initialize Stripe Elements on page load (no PaymentIntent needed yet for the element to render)
  elements = stripe.elements({ mode: 'payment', amount: ${total * 100}, currency: 'usd' });
  var paymentElement = elements.create('payment');
  paymentElement.mount('#payment-element');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearErr();

    var name    = document.getElementById('shippingName').value.trim();
    var email   = document.getElementById('shippingEmail').value.trim();
    var line1   = document.getElementById('addrLine1').value.trim();
    var line2   = document.getElementById('addrLine2').value.trim();
    var city    = document.getElementById('addrCity').value.trim();
    var state   = document.getElementById('addrState').value;
    var zip     = document.getElementById('addrZip').value.trim();

    if (!name || !email || !line1 || !city || !state || !zip) {
      showErr('Please fill in all required shipping fields.');
      return;
    }
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {
      showErr('Please enter a valid email address.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing…';

    // Step 1: submit Stripe Elements to validate + tokenize
    var submitResult = await elements.submit();
    if (submitResult.error) {
      showErr(submitResult.error.message || 'Card error. Please check your details.');
      return;
    }

    // Step 2: create PaymentIntent on our server
    var intentRes;
    try {
      var r = await fetch('/api/hardware/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_id: TRIAL_ID,
          qty: QTY,
          shipping_name: name,
          shipping_email: email,
          shipping_address: { line1, line2: line2 || null, city, state, postal_code: zip }
        })
      });
      intentRes = await r.json();
    } catch(err) {
      showErr('Network error. Please try again.');
      return;
    }

    if (!intentRes.ok || !intentRes.client_secret) {
      showErr(intentRes.error || 'Could not initialize payment. Please try again.');
      return;
    }

    form.style.display = 'none';
    loading.style.display = 'block';

    // Step 3: confirm payment with Stripe.js
    var confirmResult = await stripe.confirmPayment({
      elements,
      clientSecret: intentRes.client_secret,
      confirmParams: {
        return_url: SUCCESS_URL,
        payment_method_data: {
          billing_details: { name, email }
        }
      }
    });

    // If we get here, confirmPayment failed (success triggers a page redirect)
    if (confirmResult.error) {
      showErr(confirmResult.error.message || 'Payment failed. Please try again.');
    }
  });
})();
</script>

</body>
</html>`;
}

const US_STATES = `<option value="AL">AL</option><option value="AK">AK</option><option value="AZ">AZ</option><option value="AR">AR</option><option value="CA">CA</option><option value="CO">CO</option><option value="CT">CT</option><option value="DE">DE</option><option value="FL">FL</option><option value="GA">GA</option><option value="HI">HI</option><option value="ID">ID</option><option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option><option value="KS">KS</option><option value="KY">KY</option><option value="LA">LA</option><option value="ME">ME</option><option value="MD">MD</option><option value="MA">MA</option><option value="MI">MI</option><option value="MN">MN</option><option value="MS">MS</option><option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option><option value="NV">NV</option><option value="NH">NH</option><option value="NJ">NJ</option><option value="NM">NM</option><option value="NY">NY</option><option value="NC">NC</option><option value="ND">ND</option><option value="OH">OH</option><option value="OK">OK</option><option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option><option value="SC">SC</option><option value="SD">SD</option><option value="TN">TN</option><option value="TX">TX</option><option value="UT">UT</option><option value="VT">VT</option><option value="VA">VA</option><option value="WA">WA</option><option value="WV">WV</option><option value="WI">WI</option><option value="WY">WY</option>`;

export default hw;
