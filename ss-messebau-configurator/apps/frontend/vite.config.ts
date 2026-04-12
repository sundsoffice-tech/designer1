import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

const basePath = process.env.GITHUB_PAGES === "true" ? "/designer1/" : "/";

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Force a single three.js instance to avoid multi-instance warnings
      three: fileURLToPath(new URL("./node_modules/three", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("three") || id.includes("@react-three")) {
              return "three";
            }
            if (id.includes("react")) {
              return "react";
            }
          }
        },
      },
    },
  },
  server: {
    host: true,
  },
  optimizeDeps: {
    // Rapier ships a custom WASM init signature; esbuild prebundling rewrites the call
    // and triggers the "pass a single object" deprecation warning. Skipping keeps the
    // original loader untouched in dev.
    exclude: ["@dimforge/rapier3d-compat", "@react-three/rapier"],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "apple-touch-icon.png", "offline.html"],
      manifest: {
        name: "Designer1 Standkonfigurator",
        short_name: "Designer1",
        description: "Konfiguriere Messestaende offline und mobil",
        start_url: basePath,
        scope: basePath,
        display: "standalone",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/data/") || url.pathname.endsWith(".json"),
            handler: "NetworkFirst",
            options: {
              cacheName: "designer-data",
              matchOptions: {
                ignoreSearch: true,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts" },
          },
          {
            urlPattern: /\/assets\/.*\.(js|css|png|jpg|jpeg|svg|json)$/i,
            handler: "CacheFirst",
            options: { cacheName: "static-assets" },
          },
        ],
        offlineGoogleAnalytics: true,
      },
    }),
  ],
});
