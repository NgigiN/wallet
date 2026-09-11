import type { MiddlewareHandler } from "hono";
import type { Env } from "../env.js";
import { compareSemver, parseClientHeader } from "../services/version.js";

export function requireClientVersion(env: Pick<Env, "MIN_CLIENT_ANDROID" | "MIN_CLIENT_WEB">): MiddlewareHandler {
  return async (c, next) => {
    const parsed = parseClientHeader(c.req.header("x-client"));
    if (!parsed) return c.json({ error: "client_header_required", message: "X-Client: <android|web>/<semver>" }, 400);
    const min = parsed.platform === "android" ? env.MIN_CLIENT_ANDROID : env.MIN_CLIENT_WEB;
    if (compareSemver(parsed.version, min) < 0) {
      return c.json({ error: "upgrade_required", min, platform: parsed.platform }, 426);
    }
    await next();
  };
}
