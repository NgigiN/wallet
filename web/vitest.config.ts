import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify("0.1.0-test") },
  // TZ is pinned to a non-UTC, half-hour-offset zone so date round-trip tests cannot pass
  // trivially on UTC CI runners (a UTC-read-as-local bug is invisible at offset 0).
  test: { environment: "jsdom", setupFiles: ["test/setup.ts"], include: ["test/**/*.test.{ts,tsx}"], css: false, env: { TZ: "Asia/Kolkata" } },
});
