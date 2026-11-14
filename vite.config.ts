import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset URL relative, so the export works at an IPFS gateway subpath or an ENS name.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { global: "globalThis" },
  resolve: { alias: { buffer: "buffer/" } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2500, sourcemap: false },
  test: { include: ["test/unit/**/*.test.ts", "test/unit/**/*.test.tsx"], environment: "node" },
} as any);
