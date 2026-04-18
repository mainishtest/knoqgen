-- ============================================================
-- Migration 001 — Multi-tenancy, per-user auth, 14-day expiration
-- Run in Neon SQL editor in order. Idempotent where possible.
-- ============================================================

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS organizations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   TEXT UNIQUE NOT NULL,                -- [a-z0-9-], 3-40
  display_name           TEXT NOT NULL,
  reply_to_email         TEXT NOT NULL,
  notify_email           TEXT NOT NULL,
  phone                  TEXT,
  website                TEXT,
  logo_key               TEXT,
  brand_color            TEXT,
  tagline                TEXT,
  services               JSONB DEFAULT '[]'::JSONB,
  service_areas          TEXT,
  -- Lifecycle
  status                 TEXT NOT NULL DEFAULT 'trial'
                           CHECK (status IN ('trial','active','suspended','canceled')),
  trial_signup_id        UUID,                                -- FK added later (soft)
  trial_ends_at          TIMESTAMPTZ,
  -- Sending domain (Option C)
  sending_mode           TEXT NOT NULL DEFAULT 'shared'
                           CHECK (sending_mode IN ('shared','custom')),
  custom_sending_domain  TEXT,
  custom_sending_domain_id TEXT,
  custom_sending_verified BOOLEAN NOT NULL DEFAULT false,
  -- Custom landing-page domain (Cloudflare for SaaS)
  custom_landing_domain  TEXT UNIQUE,
  custom_landing_verified BOOLEAN NOT NULL DEFAULT false,
  custom_landing_hostname_id TEXT,                            -- Cloudflare custom hostname id
  -- Billing (Stripe)
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan                   TEXT,                                -- 'monthly','annual', null=trial
  billing_status         TEXT,                                -- active, past_due, canceled, unpaid, trialing
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_slug   ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_org_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_org_custom_landing ON organizations(custom_landing_domain) WHERE custom_landing_domain IS NOT NULL;

-- ════════════════════════════════════════════════════════════
-- 2. USERS (per-user auth)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT,                                     -- null until invite accepted
  name             TEXT,
  phone            TEXT,
  is_super_admin   BOOLEAN NOT NULL DEFAULT false,           -- cross-org panel access
  email_verified_at TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

-- ════════════════════════════════════════════════════════════
-- 3. MEMBERSHIPS (user ↔ org, many-to-many for org switching)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner','rep')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  invited_by      UUID REFERENCES users(id),
  invite_token    TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_mem_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_mem_org  ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_mem_invite_token ON memberships(invite_token) WHERE invite_token IS NOT NULL;

-- ════════════════════════════════════════════════════════════
-- 4. SESSIONS
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash        TEXT UNIQUE NOT NULL,                   -- SHA-256 of cookie value
  active_org_id     UUID REFERENCES organizations(id),      -- current org (for switching)
  ip                TEXT,
  user_agent        TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sess_token    ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sess_user     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sess_expires  ON sessions(expires_at);

-- ════════════════════════════════════════════════════════════
-- 5. ADD organization_id TO EXISTING TENANT TABLES
--    Columns start nullable, backfill, then set NOT NULL.
-- ════════════════════════════════════════════════════════════
ALTER TABLE active_jobs    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE landing_pages  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE campaigns      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE leads          ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE page_events    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Rep attribution on pages: add user_id FK (keep rep_name for display)
ALTER TABLE landing_pages  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

-- ════════════════════════════════════════════════════════════
-- 6. 14-DAY EXPIRATION
-- ════════════════════════════════════════════════════════════
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS video_deleted_at TIMESTAMPTZ;

-- Default expires_at = created_at + 14 days for all new rows
ALTER TABLE landing_pages ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '14 days');

-- Backfill existing pages (they get 14 days from now, not from creation)
UPDATE landing_pages
SET expires_at = now() + INTERVAL '14 days'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_landing_pages_expires ON landing_pages(expires_at) WHERE video_deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════
-- 7. SEED ORG #1 — demo org + owner user
--    TODO (whitelabel): customize slug, display_name, and owner email
--    before running on a new install.
-- ════════════════════════════════════════════════════════════
INSERT INTO organizations (slug, display_name, reply_to_email, notify_email, status, sending_mode, custom_sending_domain, custom_sending_verified, plan)
VALUES (
  'demo-org',
  'Demo Organization',
  'admin@example.com',
  'admin@example.com',
  'active',
  'shared',
  NULL,
  false,
  'annual'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (email, name, is_super_admin)
VALUES ('admin@example.com', 'Admin', true)
ON CONFLICT (email) DO UPDATE SET is_super_admin = true;

INSERT INTO memberships (user_id, organization_id, role, accepted_at)
SELECT u.id, o.id, 'owner', now()
FROM users u, organizations o
WHERE u.email = 'admin@example.com' AND o.slug = 'demo-org'
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 8. BACKFILL organization_id ON EXISTING ROWS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  org1 UUID;
BEGIN
  SELECT id INTO org1 FROM organizations WHERE slug = 'demo-org';

  UPDATE active_jobs    SET organization_id = org1 WHERE organization_id IS NULL;
  UPDATE landing_pages  SET organization_id = org1 WHERE organization_id IS NULL;
  UPDATE campaigns      SET organization_id = org1 WHERE organization_id IS NULL;
  UPDATE leads          SET organization_id = org1 WHERE organization_id IS NULL;
  UPDATE page_events    SET organization_id = org1 WHERE organization_id IS NULL;
END $$;

-- After verifying no rows slipped through, flip NOT NULL:
ALTER TABLE active_jobs    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE landing_pages  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE campaigns      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE leads          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE page_events    ALTER COLUMN organization_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════
-- 9. COMPOSITE INDEXES FOR ORG-SCOPED QUERIES
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_landing_pages_org_created ON landing_pages(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_created         ON leads(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_status          ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_active      ON campaigns(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_active_jobs_org_status    ON active_jobs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_page_events_org_type      ON page_events(organization_id, event_type);

-- ════════════════════════════════════════════════════════════
-- 10. Link trial_signups to organizations (soft FK via col)
-- ════════════════════════════════════════════════════════════
ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS provisioned_org_id UUID REFERENCES organizations(id);
