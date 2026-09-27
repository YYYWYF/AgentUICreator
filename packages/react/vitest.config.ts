import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { generatedSourceTestConfig } from "../../scripts/generated-source-test-config";
export default defineConfig(generatedSourceTestConfig(fileURLToPath(new URL(".", import.meta.url))));
