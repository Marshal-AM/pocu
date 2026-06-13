import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["web/lib/wallet/__tests__/**/*.test.ts", "test/ap2/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "web"),
    },
  },
});
