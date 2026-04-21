import { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "./types";

const COOKIE_NAME = "knoqgen_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Simple password-gate middleware.
 * If the user has a valid auth cookie, let them through.
 * If not, show a login form or validate the password POST.
 */
export async function authGate(c: Context<{ Bindings: Env }>, next: Next) {
  const token = getCookie(c, COOKIE_NAME);
  const password = c.env.ADMIN_PASSWORD;

  // Already authenticated
  if (token === password) {
    return next();
  }

  // Handle login POST
  if (c.req.method === "POST") {
    const body = await c.req.parseBody();
    if (body.password === password) {
      setCookie(c, COOKIE_NAME, password, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });
      return c.redirect(c.req.url);
    }
    return c.html(loginPage("Incorrect password. Please try again."), 401);
  }

  return c.html(loginPage(), 200);
}

function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Heebo:wght@400;500;600;700&display=swap" rel="stylesheet">
  <title>Team Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f7fa; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; max-width: 380px;
            width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; }
    h1 { font-family: 'Montserrat', 'Heebo', sans-serif; font-size: 22px; color: #32373c; margin-bottom: 4px; }
    p.sub { font-size: 14px; color: #888; margin-bottom: 24px; }
    input { width: 100%; padding: 12px 16px; border: 1.5px solid #ddd; border-radius: 8px;
            font-size: 16px; font-family: 'Heebo', sans-serif; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #8145FC; box-shadow: 0 0 0 3px rgba(129,69,252,0.1); }
    button { width: 100%; padding: 14px; background: #8145FC; color: white; border: none;
             border-radius: 8px; font-size: 16px; font-weight: 600; font-family: 'Heebo', sans-serif; cursor: pointer; }
    button:hover { background: #391991; }
    .error { color: #c62828; font-size: 14px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Team Login</h1>
    <p class="sub">Enter your password to continue</p>
    ${error ? `<p class="error">${error}</p>` : ""}
    <form method="POST">
      <input type="password" name="password" placeholder="Team password" autofocus required>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}
