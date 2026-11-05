import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: "es2022"
  },
  server: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true
  }
});
