import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { generatedSourceTestConfig } from "../../../scripts/generated-source-test-config";
const config = generatedSourceTestConfig(fileURLToPath(new URL(".", import.meta.url)));
// Operator cases initialize, typecheck and build installed production graphs.
// Keep the other packages' unit-test budgets and existing worker counts unchanged.
export default defineConfig({ ...config, test: { ...config.test, testTimeout: 120_000 } });
