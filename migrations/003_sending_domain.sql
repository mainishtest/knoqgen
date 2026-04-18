-- Track the Resend domain ID so we can verify + inspect without re-creating.
-- Create the domain once, poll /domains/:id for verification, optionally delete.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS resend_domain_id TEXT,
  ADD COLUMN IF NOT EXISTS sending_domain_records JSONB;

-- sending_domain_records caches the DNS records Resend returned on create,
-- so the UI can display them without another API call.

-- The existing columns we already use:
--   sending_mode          'shared' | 'custom'
--   custom_sending_domain TEXT (e.g. 'mail.yourcompany.com')
--   custom_sending_verified BOOLEAN
