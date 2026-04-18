-- ============================================================
-- KnoqGen — Neon Postgres Schema
-- Run this in the Neon SQL Editor or via psql
-- ============================================================

-- Active painting jobs
CREATE TABLE IF NOT EXISTS active_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address      TEXT NOT NULL,
  neighborhood TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Landing pages (one per QR code / neighborhood)
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

-- Leads (estimate requests from homeowners)
CREATE TABLE IF NOT EXISTS leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id      UUID REFERENCES landing_pages(id) NOT NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  project_note TEXT,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaigns / drops (groups of landing pages for a neighborhood push)
CREATE TABLE IF NOT EXISTS campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  neighborhood TEXT,
  job_id       UUID REFERENCES active_jobs(id),
  created_by   TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Analytics events
CREATE TABLE IF NOT EXISTS page_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID REFERENCES landing_pages(id) NOT NULL,
  event_type TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Free-trial signups (no credit card — manually onboarded)
CREATE TABLE IF NOT EXISTS trial_signups (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL,
  name                 TEXT,
  company              TEXT,
  phone                TEXT,
  team_size            TEXT,
  source               TEXT,                                      -- utm / referrer tag
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','active','expired','converted','canceled')),
  trial_starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  converted_at         TIMESTAMPTZ,
  -- Step 2: self-serve intake
  intake               JSONB,                                     -- see trial.ts for shape
  assets               JSONB DEFAULT '[]'::JSONB,                 -- [{kind:'logo'|'video'|'photo', key, content_type, size}]
  intake_completed_at  TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- For existing deployments, run these to add columns idempotently:
-- ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS intake JSONB;
-- ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS assets JSONB DEFAULT '[]'::JSONB;
-- ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS intake_completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_trial_signups_email ON trial_signups(email);
CREATE INDEX IF NOT EXISTS idx_trial_signups_status ON trial_signups(status);
CREATE INDEX IF NOT EXISTS idx_trial_signups_ends_at ON trial_signups(trial_ends_at);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_leads_page_id ON leads(page_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_events_page_id ON page_events(page_id);
CREATE INDEX IF NOT EXISTS idx_page_events_type ON page_events(event_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_landing_pages_campaign ON landing_pages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
