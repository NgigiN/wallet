import { createAuth } from "./src/auth.js";
import { createDb } from "./src/db/client.js";
import { loadEnv } from "./src/env.js";
export const auth = createAuth(createDb("postgres://x").db, loadEnv({
  DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef", BETTER_AUTH_URL: "http://localhost:8080",
}));
