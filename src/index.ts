import { Hono } from "hono";
import type { Env } from "./lib/db";
import { resolveSession } from "./lib/session";
import { cleanupExpiredVideos } from "./lib/cleanup";
import { publicLayout, adminLayout } from "./lib/html";
import landing from "./routes/landing";
import rep from "./routes/rep";
import admin from "./routes/admin";
import api from "./routes/api";
import auth from "./routes/auth";
import superPanel from "./routes/super";
import sales from "./routes/sales";
import checkout from "./routes/checkout";
import trial from "./routes/trial";
import hardware from "./routes/hardware";

const app = new Hono<{ Bindings: Env }>();

// ── Global error handler ──
app.onError((err, c) => {
  console.error("Unhandled error:", err.message, err.stack);
  const isApi = c.req.path.startsWith("/api/");
  if (isApi) {
    return c.json({ error: "Internal server error" }, 500);
  }
  return c.html(publicLayout("Something went wrong", `
    <div style="max-width:480px;margin:0 auto;padding:60px 20px;text-align:center">
      <h1 style="font-family:'Montserrat',sans-serif;font-size:48px;color:#32373c;margin-bottom:8px">500</h1>
      <h2 style="font-family:'Montserrat',sans-serif;font-size:20px;color:#555;margin-bottom:16px">Something went wrong</h2>
      <p style="color:#888;margin-bottom:24px">We hit an unexpected error. Please try again in a moment.</p>
      <a href="/" style="display:inline-block;padding:12px 24px;background:#8145FC;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Go Home</a>
    </div>
  `), 500);
});

// ── Root: logged-in → /rep, else → /sell (public marketing) ──
app.get("/", async (c) => {
  const s = await resolveSession(c);
  if (s && s.org) return c.redirect("/rep");
  if (s && !s.org) return c.redirect("/onboarding/new-org");
  return c.redirect("/sell");
});

// ── Mount routes ──
// Auth (login/signup/logout/invite) — public + self-serve
app.route("/", auth);

// Super-admin panel (gated by requireSuperAdmin inside)
app.route("/", superPanel);

// Public: landing pages + lead/event APIs
app.route("/", landing);

// API routes (auth enforced per-route inside)
app.route("/", api);

// Rep + admin (auth enforced per-route inside via requireAuth)
app.route("/", rep);
app.route("/", admin);

// Public: sales + checkout + trial intake + hardware order
app.route("/", sales);
app.route("/", checkout);
app.route("/", trial);
app.route("/", hardware);

// ── 404 catch-all (must be last) ──
app.notFound((c) => {
  const isApi = c.req.path.startsWith("/api/");
  if (isApi) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.html(publicLayout("Page Not Found", `
    <div style="max-width:480px;margin:0 auto;padding:60px 20px;text-align:center">
      <h1 style="font-family:'Montserrat',sans-serif;font-size:48px;color:#32373c;margin-bottom:8px">404</h1>
      <h2 style="font-family:'Montserrat',sans-serif;font-size:20px;color:#555;margin-bottom:16px">Page not found</h2>
      <p style="color:#888;margin-bottom:24px">The page you're looking for doesn't exist or has been moved.</p>
      <a href="/" style="display:inline-block;padding:12px 24px;background:#8145FC;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Go Home</a>
    </div>
  `), 404);
});

export default {
  fetch: app.fetch,
  // Cron handler for daily cleanup of expired video assets
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanupExpiredVideos(env).then((r) =>
        console.log("cleanup:", r),
      ),
    );
  },
};
