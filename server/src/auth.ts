import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, organization } from "better-auth/plugins";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";
import type { Env } from "./env.js";
import { seedCategories } from "./services/categories.js";

export function createAuth(db: Db, env: Env) {
  const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    trustedOrigins: env.TRUSTED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    plugins: [
      bearer(),
      organization({
        organizationHooks: {
          afterCreateOrganization: async ({ organization }) => {
            await seedCategories(db, organization.id);
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await auth.api.createOrganization({
              body: {
                name: "Personal",
                slug: `personal-${user.id.toLowerCase()}`,
                userId: user.id,
                metadata: { kind: "personal" },
              },
            });
          },
        },
      },
    },
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
