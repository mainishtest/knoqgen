-- Audit log for super-admin actions and sensitive org mutations.
-- Append-only. Super-admins read it via /super/audit.

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID REFERENCES users(id),
  actor_email     TEXT NOT NULL,                 -- denormalized in case the user is deleted
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,                 -- e.g. 'org.provision', 'org.status_change', 'org.switch_in', 'landing_domain.update'
  target_kind     TEXT,                          -- 'organization' | 'user' | 'trial_signup' | ...
  target_id       TEXT,                          -- string so we can store non-UUIDs too
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip              TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);
