-- ============================================================
-- FULL DATABASE SETUP — run this in Neon SQL Editor
-- Combines schema.sql + all migrations in correct order
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════
-- 1. BASE TABLES (dependency order fixed)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS active_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address      TEXT NOT NULL,
  neighborhood TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  neighborhood TEXT,
  job_id       UUID REFERENCES active_jobs(id),
  created_by   TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landing_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  video_key   TEXT NOT NULL,
  street_name TEXT NOT NULL,
  job_id      UUID REFERENCES active_jobs(id),
  rep_name    TEXT,
  rep_note    TEXT,
  campaign_id UUID REFERENCES campaigns(id),
  photos      JSONB DEFAULT '[]'::JSONB,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  scan_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id      UUID REFERENCES landing_pages(id) NOT NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  project_note TEXT,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  contacted_at TIMESTAMPTZ,
  quoted_at    TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ,
  job_value    INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID REFERENCES landing_pages(id) NOT NULL,
  event_type TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trial_signups (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL,
  name                 TEXT,
  company              TEXT,
  phone                TEXT,
  team_size            TEXT,
  source               TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','active','expired','converted','canceled')),
  trial_starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  converted_at         TIMESTAMPTZ,
  intake               JSONB,
  assets               JSONB DEFAULT '[]'::JSONB,
  intake_completed_at  TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 2. MULTI-TENANCY TABLES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organizations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   TEXT UNIQUE NOT NULL,
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
  status                 TEXT NOT NULL DEFAULT 'trial'
                           CHECK (status IN ('trial','active','suspended','canceled')),
  trial_signup_id        UUID,
  trial_ends_at          TIMESTAMPTZ,
  sending_mode           TEXT NOT NULL DEFAULT 'shared'
                           CHECK (sending_mode IN ('shared','custom')),
  custom_sending_domain  TEXT,
  custom_sending_domain_id TEXT,
  custom_sending_verified BOOLEAN NOT NULL DEFAULT false,
  resend_domain_id       TEXT,
  sending_domain_records JSONB,
  custom_landing_domain  TEXT UNIQUE,
  custom_landing_verified BOOLEAN NOT NULL DEFAULT false,
  custom_landing_hostname_id TEXT,
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan                   TEXT,
  billing_status         TEXT,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT,
  name             TEXT,
  phone            TEXT,
  is_super_admin   BOOLEAN NOT NULL DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash        TEXT UNIQUE NOT NULL,
  active_org_id     UUID REFERENCES organizations(id),
  ip                TEXT,
  user_agent        TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID REFERENCES users(id),
  actor_email     TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  target_kind     TEXT,
  target_id       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip              TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 3. ADD organization_id TO EXISTING TABLES
-- ═══════════════════════════════════════════════════════════
ALTER TABLE active_jobs    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE landing_pages  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE campaigns      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE leads          ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE page_events    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE landing_pages  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);
ALTER TABLE landing_pages  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days');
ALTER TABLE landing_pages  ADD COLUMN IF NOT EXISTS video_deleted_at TIMESTAMPTZ;
ALTER TABLE trial_signups  ADD COLUMN IF NOT EXISTS provisioned_org_id UUID REFERENCES organizations(id);

-- ═══════════════════════════════════════════════════════════
-- 4. SEED: demo org + super-admin owner
--    TODO (whitelabel): before running this migration on a new install,
--    replace the slug, display_name, and super-admin email below with
--    values for your own first tenant / account owner.
-- ═══════════════════════════════════════════════════════════
INSERT INTO organizations (slug, display_name, reply_to_email, notify_email, status, sending_mode)
VALUES (
  'demo-org',
  'Demo Organization',
  'admin@example.com',
  'admin@example.com',
  'active',
  'shared'
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

-- ═══════════════════════════════════════════════════════════
-- 5. BACKFILL org_id on any pre-existing rows, then enforce NOT NULL
-- ═══════════════════════════════════════════════════════════
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

ALTER TABLE active_jobs    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE landing_pages  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE campaigns      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE leads          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE page_events    ALTER COLUMN organization_id SET NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 6. ALL INDEXES
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_org_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_org_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_org_custom_landing ON organizations(custom_landing_domain) WHERE custom_landing_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_mem_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_mem_org ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_mem_invite_token ON memberships(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sess_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sess_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_pages_expires ON landing_pages(expires_at) WHERE video_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_landing_pages_org_created ON landing_pages(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_page_id ON leads(page_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_created ON leads(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_page_events_page_id ON page_events(page_id);
CREATE INDEX IF NOT EXISTS idx_page_events_type ON page_events(event_type);
CREATE INDEX IF NOT EXISTS idx_page_events_org_type ON page_events(organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_active ON campaigns(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_landing_pages_campaign ON landing_pages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_active_jobs_org_status ON active_jobs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_trial_signups_email ON trial_signups(email);
CREATE INDEX IF NOT EXISTS idx_trial_signups_status ON trial_signups(status);
CREATE INDEX IF NOT EXISTS idx_trial_signups_ends_at ON trial_signups(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
