-- ============================================================
-- Migration 001: hardware_orders table
-- Run in Neon SQL Editor after 000_full_setup.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS hardware_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_signup_id         UUID REFERENCES trial_signups(id),
  organization_id         UUID REFERENCES organizations(id),

  product_sku             TEXT NOT NULL DEFAULT 'printer-bundle-v1',
  product_name            TEXT NOT NULL DEFAULT 'QR Printer Bundle',
  qty                     INTEGER NOT NULL DEFAULT 1,
  unit_price_cents        INTEGER NOT NULL DEFAULT 9900,
  total_cents             INTEGER NOT NULL,

  stripe_session_id       TEXT,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_payment_status   TEXT,

  fulfillment_status      TEXT NOT NULL DEFAULT 'pending'
                            CHECK (fulfillment_status IN ('pending','processing','shipped','delivered','canceled','refunded')),

  -- Shipping address captured by Stripe Checkout
  shipping_name           TEXT,
  shipping_email          TEXT,
  shipping_address        JSONB DEFAULT '{}'::JSONB,

  -- Fulfillment tracking
  tracking_number         TEXT,
  carrier                 TEXT,

  -- Future: Amazon Multi-Channel Fulfillment integration
  amazon_mcf_order_id     TEXT,

  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hardware_orders_trial    ON hardware_orders(trial_signup_id);
CREATE INDEX IF NOT EXISTS idx_hardware_orders_org      ON hardware_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_hardware_orders_status   ON hardware_orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_hardware_orders_stripe   ON hardware_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_hardware_orders_created  ON hardware_orders(created_at DESC);
