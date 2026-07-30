import { defineConfig } from "vitest/config";
import path from "path";

// Mirrors tsconfig.json's "@/*" path alias for component tests that import
// via "@/..." (plain `vitest run` has no bundler-level alias otherwise).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
