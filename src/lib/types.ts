// ── Cloudflare Worker Bindings ──
export type Env = {
  VIDEO_BUCKET: R2Bucket;
  DATABASE_URL: string;
  ADMIN_PASSWORD: string;
  COMPANY_NAME: string;
  COMPANY_PHONE: string;
  COMPANY_TAGLINE: string;
  SITE_URL: string;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  STRIPE_SECRET_KEY: string;
};

// ── Database Row Types ──
export type ActiveJob = {
  id: string;
  address: string;
  neighborhood: string | null;
  status: "active" | "completed";
  created_at: string;
};

export type Campaign = {
  id: string;
  name: string;
  neighborhood: string | null;
  job_id: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
};

export type LandingPage = {
  id: string;
  slug: string;
  video_key: string;
  street_name: string;
  job_id: string | null;
  campaign_id: string | null;
  rep_name: string | null;
  rep_note: string | null;
  photos: string[];
  is_active: boolean;
  scan_count: number;
  created_at: string;
};

export type Lead = {
  id: string;
  page_id: string;
  name: string;
  phone: string;
  email: string | null;
  project_note: string | null;
  status: "new" | "contacted" | "quoted" | "won" | "lost";
  created_at: string;
};

export type PageEvent = {
  id: string;
  page_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
