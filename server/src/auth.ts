import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, organization } from "better-auth/plugins";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";
import type { Env } from "./env.js";

export function createAuth(db: Db, env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    trustedOrigins: env.TRUSTED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    plugins: [bearer(), organization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
