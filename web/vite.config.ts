import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fonts/sora.ttf", "icons/apple-touch-icon-180.png"],
      manifest: {
        name: "Wallet",
        short_name: "Wallet",
        description: "Track M-PESA, Airtel and cash spending.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0B4A33",
        theme_color: "#0B4A33",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
        globPatterns: ["**/*.{js,css,html,ttf,png,svg,webmanifest}"],
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith("/api/"), handler: "NetworkOnly" }],
      },
    }),
  ],
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: false },
      "/health": { target: "http://127.0.0.1:8080", changeOrigin: false },
    },
  },
  // "hidden" still emits the maps for stack symbolication but drops the sourceMappingURL
  // comment, so the bundle does not advertise them to anyone poking at the deployed app.
  build: { sourcemap: "hidden" },
});
