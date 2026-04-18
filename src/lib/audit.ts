// Append-only audit log helper. Called from super-admin actions and
// sensitive org mutations (billing, domain changes, team invites).

import type { Context } from "hono";
import { getDb, type Env } from "./db";

export type AuditEntry = {
  actorUserId?: string | null;
  actorEmail: string;
  organizationId?: string | null;
  action: string;
  targetKind?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(
  env: Env,
  c: Context<any> | null,
  entry: AuditEntry,
): Promise<void> {
  const sql = getDb(env);
  const ip = c?.req.header("cf-connecting-ip") || c?.req.header("x-forwarded-for") || null;
  const ua = c?.req.header("user-agent") || null;
  try {
    await sql`
      INSERT INTO audit_log
        (actor_user_id, actor_email, organization_id, action, target_kind, target_id, metadata, ip, user_agent)
      VALUES
        (${entry.actorUserId ?? null}, ${entry.actorEmail}, ${entry.organizationId ?? null},
         ${entry.action}, ${entry.targetKind ?? null}, ${entry.targetId ?? null},
         ${JSON.stringify(entry.metadata ?? {})}, ${ip}, ${ua})
    `;
  } catch (err) {
    // Never fail the caller because of audit-log write failure.
    console.error("audit write failed:", err);
  }
}
