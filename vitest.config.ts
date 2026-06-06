import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      // Use fileURLToPath to correctly decode percent-encoded characters
      // (e.g., spaces) in the working-directory path. URL.pathname leaves
      // `%20` in place, which breaks resolution on macOS paths containing
      // spaces (e.g., "/Volumes/Vivek mac/apps/crypto-app").
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
