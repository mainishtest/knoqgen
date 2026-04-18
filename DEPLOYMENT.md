# Multi-Tenancy Deployment Checklist

KnoqGen is a multi-tenant SaaS platform with per-user auth, org-scoped
data, Stripe billing, custom landing domains, and a 14-day video retention
policy. Follow these steps in order when shipping.

## 1. Database migration

Run the migration against Neon (pooled connection):

```bash
psql "$DATABASE_URL" -f migrations/001_multi_tenancy.sql
psql "$DATABASE_URL" -f migrations/002_audit_log.sql
psql "$DATABASE_URL" -f migrations/003_sending_domain.sql
```

The migration is idempotent. It:

- Creates `organizations`, `users`, `memberships`, `sessions`.
- Adds `organization_id` to `active_jobs`, `campaigns`, `landing_pages`,
  `leads`, `page_events`, backfills every row to the seeded demo org,
  then flips the column `NOT NULL`.
- Adds `expires_at` (default `now() + 14 days`) and `video_deleted_at` to
  `landing_pages`. Existing rows get backdated expirations.
- Seeds a demo org with `sending_mode='shared'`. Customize the slug,
  display name, and super-admin email in the migration before running.
- Seeds an `admin@example.com` super-admin owner on the demo org
  (change before deploy).

Verify afterwards:

```sql
SELECT slug, display_name, status, sending_mode, custom_sending_verified
FROM organizations;

SELECT email, is_super_admin FROM users;

SELECT COUNT(*) FROM landing_pages WHERE organization_id IS NULL; -- should be 0
```

## 2. Secrets

Set these with `wrangler secret put <NAME>`:

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection (already set) |
| `RESEND_API_KEY` | Already set — must also have `leads.knoqgen.com` verified |
| `STRIPE_SECRET_KEY` | `sk_live_...` — for subscription management |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhook endpoint |
| `CF_API_TOKEN` | Cloudflare token w/ Zone:Custom Hostnames edit on the KnoqGen zone |
| `CF_ZONE_ID` | Zone ID for `knoqgen.com` |
| `ADMIN_PASSWORD` | Keep as legacy placeholder — no longer used by any route |

`CF_FALLBACK_ORIGIN` is now in `[vars]` in `wrangler.toml`.

## 3. DNS / Resend

1. In Resend, verify `leads.knoqgen.com` as a sending domain. Add the
   required SPF, DKIM, and DMARC records to the `knoqgen.com` zone in
   Cloudflare DNS.
2. Confirm `estimate.knoqgen.com` is still verified (existing 1st
   Choice Painting senders keep working).
3. Platform onboarding emails also send from `estimate.knoqgen.com`
   (`sendPlatformEmail`) — leave as is.

## 4. Cloudflare for SaaS

For custom landing-page domains per org:

1. In the Cloudflare dashboard, enable Cloudflare for SaaS on the
   `knoqgen.com` zone.
2. Set a fallback origin — route `*.knoqgen.com` (or CNAME target) to
   this Worker.
3. The API token needs `Zone: SSL and Certificates: Edit` + `Zone: Custom
   Hostnames: Edit` on that zone.

Tenants set their own domain via `POST /api/org/landing-domain`. We call the
Cloudflare `custom_hostnames` API and return verification instructions
(CNAME `→ cname.knoqgen.com`).

## 5. Stripe

1. Create a webhook endpoint in Stripe pointed at
   `https://knoqgen.com/api/stripe/webhook` subscribed to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
2. Copy the signing secret into the `STRIPE_WEBHOOK_SECRET` Worker secret.
3. Ensure checkout sessions are created with
   `client_reference_id = organization.id` (Billing/Checkout routes — see
   `src/routes/checkout.ts`).

## 6. Cron

`wrangler.toml` registers a daily cron at `0 7 * * *` UTC. It calls
`cleanupExpiredVideos` which:

- Selects up to 200 landing pages where `expires_at < now()` and
  `video_deleted_at IS NULL`
- Deletes the underlying R2 object
- Sets `video_deleted_at = now()` and `is_active = false`

Test locally with `wrangler dev --test-scheduled` then hit
`http://localhost:8787/__scheduled?cron=0+7+*+*+*`.

## 7. Deploy

```bash
npx tsc --noEmit
npx wrangler deploy
```

## 8. Smoke test

1. Sign up a new trial org at `/signup`. Verify:
   - Welcome email arrives from `hello@estimate.knoqgen.com`
   - `organizations.status = 'trial'` with 14-day `trial_ends_at`
   - Owner membership created, user can log in
2. As a trial user, create a landing page. Verify `expires_at = now() + 14d`
   and R2 key is `org/<slug>/videos/...`.
3. Submit a lead from `/v/<slug>` and verify the notification email uses the
   correct per-org Reply-To.
4. Log in as `david@mainish.com` (super-admin). Go to `/super` — you should
   see every org and pending trial signups. Use "Switch" to jump into any
   org.
5. Provision a pending trial signup from `/super`. Verify the invite email
   arrives and `/invite/<token>` lets the owner set their password.
6. Configure a custom landing domain on a test org via `/admin/settings` →
   verify the Cloudflare `custom_hostnames` POST succeeds.
7. Trigger the cleanup cron manually (see above) and confirm expired pages
   show the "offer has expired" message.

## 9. Rollback

If something goes sideways after deploy:

- `wrangler rollback` to revert the Worker.
- The migration is forward-only but safe — do not run destructive rollback
  SQL unless you also revert the Worker, since the new Worker code depends
  on the new schema.

## Follow-up release (2026-04-13)

Shipped:

- **Audit log** (`migrations/002_audit_log.sql` + `src/lib/audit.ts`). Super
  admins read it at `/super/audit` with filters by action and org. Currently
  writes entries for `org.switch_in`, `org.status_change`, and
  `org.provision`.
- **Per-org & per-IP rate limits** on `POST /api/leads`: 200/hour per org,
  10/hour per IP, in addition to the existing 3/hour per (phone, page).
- **Self-serve billing portal**: `POST /api/org/billing-portal` creates a
  Stripe Billing Portal session for the org's `stripe_customer_id` and
  redirects. Button appears in `/admin/settings` once an org has a
  subscription.

## Follow-up release (2026-04-13, part 2)

Shipped:

- **Self-serve custom sending domain per org**. Owners visit
  `/admin/settings/sending-domain`, submit a subdomain (e.g.
  `mail.yourcompany.com`), and we call Resend's `/domains` API to create it.
  The returned DNS records (SPF, DKIM, DMARC) are cached on the org and
  displayed in a table with per-record status. "Check status" hits
  `/v1/domains/:id/verify` + `/v1/domains/:id`. When the domain flips to
  `verified`, we set `custom_sending_verified=true` and
  `sending_mode='custom'` — `buildFrom(org)` in `src/lib/email.ts`
  automatically starts using `hello@<custom domain>`. Actions are audited
  as `sending_domain.create|verify|remove`.
- `migrations/003_sending_domain.sql` adds `resend_domain_id` and
  `sending_domain_records JSONB` to `organizations`.

Prerequisite: the Resend API key must have `domains:full_access` scope.

## Known follow-ups (still not shipped)

- Expand audit-log coverage to membership invites and billing webhook events.
