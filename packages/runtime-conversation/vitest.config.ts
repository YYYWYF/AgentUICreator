import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { generatedSourceTestConfig } from "../../scripts/generated-source-test-config";
export default defineConfig({ ...generatedSourceTestConfig(fileURLToPath(new URL(".", import.meta.url))), test: { environment: "node", maxWorkers: 2, testTimeout: 30_000, setupFiles: ["../project-control/tests/support/dom-setup.ts"] } });
