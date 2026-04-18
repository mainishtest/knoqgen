// Scheduled cleanup: delete R2 videos for landing pages past their 14-day expiration.
// Invoked from the Worker's `scheduled` handler via a cron trigger (wrangler.toml).

import { getDb, type Env } from "./db";

export async function cleanupExpiredVideos(env: Env): Promise<{ processed: number; deleted: number; errors: number }> {
  const sql = getDb(env);
  // Page in batches so a long backlog doesn't time out.
  const batch = await sql`
    SELECT id, video_key
    FROM landing_pages
    WHERE expires_at IS NOT NULL
      AND expires_at < now()
      AND video_deleted_at IS NULL
      AND video_key IS NOT NULL
    ORDER BY expires_at ASC
    LIMIT 200
  `;

  let deleted = 0;
  let errors = 0;
  for (const row of batch) {
    const r = row as { id: string; video_key: string };
    try {
      await env.VIDEO_BUCKET.delete(r.video_key);
      await sql`UPDATE landing_pages SET video_deleted_at = now(), is_active = false WHERE id = ${r.id}`;
      deleted++;
    } catch (err) {
      errors++;
      console.error("cleanup error for", r.video_key, err);
    }
  }

  return { processed: batch.length, deleted, errors };
}
