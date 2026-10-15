import { defineConfig, mergeConfig } from "vite";
import base from "../../vite.config";
import { generatedSourceTestConfig } from "../../../../scripts/generated-source-test-config";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(fileURLToPath(new URL("../../../../packages/plugins/package.json", import.meta.url)));
const generated = generatedSourceTestConfig(fileURLToPath(new URL("../../", import.meta.url)));
export default mergeConfig(base, defineConfig({ resolve: { ...generated.resolve, alias: [{find:"@za38.03/agent-ui-plugins/demo-attachments",replacement:fileURLToPath(new URL("../../../../packages/plugins/src/demo-attachments.ts",import.meta.url))},{find:"@assistant-ui/react",replacement:require.resolve("@assistant-ui/react")}, ...generated.resolve.alias] }, plugins: generated.plugins, server: { port: 5204, fs: { allow: ["/Users/yifei/Coding/AgentUICreator", "/private/var/folders", "/var/folders"] } } }));
