import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  TRUSTED_ORIGINS: z.string().default("https://wallet.samtama.lol,http://localhost:5173"),
  MIN_CLIENT_ANDROID: z.string().default("0.0.0"),
  MIN_CLIENT_WEB: z.string().default("0.0.0"),
  LEGACY_API_TOKEN: z.string().optional(),
  LEGACY_SPACE_ID: z.string().optional(),
  STATIC_DIR: z.string().default("./public"),
  APP_VERSION: z.string().default("dev"),
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source);
}
