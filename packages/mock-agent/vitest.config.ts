import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agent-ui/runtime-agui": fileURLToPath(
        new URL("../runtime-agui/src/index.ts", import.meta.url),
      ),
      "@agent-ui/runtime-core": fileURLToPath(
        new URL("../runtime-core/src/index.ts", import.meta.url),
      ),
    },
  },
});
