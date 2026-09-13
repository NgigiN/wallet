import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, organization } from "better-auth/plugins";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";
import type { Env } from "./env.js";
import { logger } from "./logger.js";
import { seedCategories } from "./services/categories.js";
import { createPersonalSpace } from "./services/spaces.js";

export function createAuth(db: Db, env: Env) {
  const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    trustedOrigins: env.TRUSTED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // Only the headers our own edge sets: nginx writes x-real-ip, Cloudflare
    // cf-connecting-ip. Leaving the default list in place would let a client spoof
    // x-forwarded-for and walk around better-auth's own rate limiting.
    advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip", "cf-connecting-ip"] } },
    plugins: [
      bearer(),
      organization({
        organizationHooks: {
          afterCreateOrganization: async ({ organization }) => {
            try {
              await seedCategories(db, organization.id);
            } catch (err) {
              logger.error({ err, organizationId: organization.id }, "space seeding failed");
              throw err;
            }
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await createPersonalSpace(auth, user.id);
            } catch (err) {
              logger.error({ err, userId: user.id }, "personal space creation failed");
              throw err;
            }
          },
        },
      },
    },
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
