import type { MiddlewareHandler } from "hono";
import type { Auth } from "../auth.js";

export type SessionVars = { user: { id: string; email: string; name: string }; sessionId: string };

export function requireSession(auth: Auth): MiddlewareHandler<{ Variables: SessionVars }> {
  return async (c, next) => {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!s) return c.json({ error: "unauthorized" }, 401);
    c.set("user", { id: s.user.id, email: s.user.email, name: s.user.name });
    c.set("sessionId", s.session.id);
    await next();
  };
}
