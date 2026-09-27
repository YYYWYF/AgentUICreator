import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { generatedSourceTestConfig } from "../../scripts/generated-source-test-config";

const config = generatedSourceTestConfig(fileURLToPath(new URL(".", import.meta.url)));
// Match tsconfig.tests.json: the official runtime dependency belongs to its owner.
config.resolve.alias.push({
  find: "@assistant-ui/react-ag-ui",
  replacement: fileURLToPath(new URL(
    "../runtime-conversation/node_modules/@assistant-ui/react-ag-ui",
    import.meta.url,
  )),
});
export default defineConfig(config);
