import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist", "public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");

          if (normalizedId.includes("/client/src/pages/coupang-")) {
            return "route-coupang";
          }

          if (normalizedId.includes("/client/src/pages/naver-")) {
            return "route-naver";
          }

          if (
            normalizedId.endsWith("/client/src/pages/catalog.tsx") ||
            normalizedId.endsWith("/client/src/pages/field-sync.tsx") ||
            normalizedId.endsWith("/client/src/pages/runs.tsx") ||
            normalizedId.endsWith("/client/src/pages/settings.tsx") ||
            normalizedId.endsWith("/client/src/pages/draft.tsx")
          ) {
            return "route-engine";
          }

          if (!normalizedId.includes("node_modules")) {
            return undefined;
          }

          if (normalizedId.includes("xlsx")) {
            return "vendor-sheet";
          }

          if (normalizedId.includes("react-data-grid")) {
            return "vendor-grid";
          }

          if (
            normalizedId.includes("@tanstack/react-query") ||
            normalizedId.includes("react-dom") ||
            normalizedId.includes("/react/") ||
            normalizedId.includes("wouter")
          ) {
            return "vendor-react";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
