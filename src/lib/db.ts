import { neon } from "@neondatabase/serverless";

export type Env = {
  DATABASE_URL: string;
  VIDEO_BUCKET: R2Bucket;
  ADMIN_PASSWORD: string;                 // legacy fallback; kept to avoid breakage
  COMPANY_NAME: string;
  COMPANY_PHONE: string;
  COMPANY_TAGLINE: string;
  SITE_URL: string;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  // Cloudflare for SaaS (custom landing-page domains)
  CF_API_TOKEN?: string;
  CF_ZONE_ID?: string;
  CF_FALLBACK_ORIGIN?: string;            // e.g. "knoqgen.com"
};

export function getDb(env: Env) {
  return neon(env.DATABASE_URL);
}

// ── Types ──

export interface Organization {
  id: string;
  slug: string;
  display_name: string;
  reply_to_email: string;
  notify_email: string;
  phone: string | null;
  website: string | null;
  logo_key: string | null;
  brand_color: string | null;
  tagline: string | null;
  services: string[];
  service_areas: string | null;
  status: "trial" | "active" | "suspended" | "canceled";
  trial_ends_at: string | null;
  sending_mode: "shared" | "custom";
  custom_sending_domain: string | null;
  custom_sending_verified: boolean;
  custom_landing_domain: string | null;
  custom_landing_verified: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  billing_status: string | null;
  current_period_end: string | null;
}

export interface ActiveJob {
  id: string;
  organization_id: string;
  address: string;
  neighborhood: string | null;
  status: "active" | "completed";
  created_at: string;
}

export interface Campaign {
  id: string;
  organization_id: string;
  name: string;
  neighborhood: string | null;
  job_id: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LandingPage {
  id: string;
  organization_id: string;
  slug: string;
  video_key: string;
  street_name: string;
  job_id: string | null;
  campaign_id: string | null;
  rep_name: string | null;
  rep_note: string | null;
  created_by_user_id: string | null;
  photos: string[];
  is_active: boolean;
  scan_count: number;
  expires_at: string | null;
  video_deleted_at: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  organization_id: string;
  page_id: string;
  name: string;
  phone: string;
  email: string | null;
  project_note: string | null;
  status: "new" | "contacted" | "quoted" | "won" | "lost";
  created_at: string;
}
