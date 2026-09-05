import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agent-ui/runtime-core": fileURLToPath(
        new URL("../runtime-core/src/index.ts", import.meta.url),
      ),
    },
  },
});
