import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

const required = {
  DATABASE_URL: "postgres://wallet:wallet@127.0.0.1:5434/wallet",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:8080",
};

describe("loadEnv SENTRY_DSN", () => {
  it("treats a blank string as unset", () => {
    expect(loadEnv({ ...required, SENTRY_DSN: "" }).SENTRY_DSN).toBeUndefined();
  });

  it("accepts a valid DSN url", () => {
    expect(loadEnv({ ...required, SENTRY_DSN: "https://k@o.ingest.sentry.io/1" }).SENTRY_DSN).toBe(
      "https://k@o.ingest.sentry.io/1",
    );
  });

  it("throws on an invalid DSN", () => {
    expect(() => loadEnv({ ...required, SENTRY_DSN: "not-a-url" })).toThrow();
  });
});
