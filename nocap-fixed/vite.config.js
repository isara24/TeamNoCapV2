// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import svgr from "vite-plugin-svgr";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    // Generate TanStack Router route tree
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    // Allow importing SVGs as React components
    svgr(),
    // React fast-refresh, TS, etc.
    react(),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
