import { fileURLToPath } from "node:url";
import path from "node:path";
import deliveries from "../../packages/plugins/src/catalog/plugin-delivery.json";
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
export const runtimeAliases = {
  "@za38.03/agent-ui-plugins/plugin-support": path.join(workspaceRoot, "packages/plugins/src/plugin-support.ts"),
  ...Object.fromEntries(deliveries.map(delivery => [
    `@za38.03/agent-ui-plugins/${delivery.id}`, path.join(workspaceRoot, "packages/plugins/dist", delivery.id, "index.js"),
  ])),
  "@za38.03/agent-ui-plugins/composer-support": `${workspaceRoot}packages/plugins/src/composer-support.ts`,
  "@za38.03/agent-ui-plugins/form-tools": `${workspaceRoot}packages/plugins/dist/form-tools.js`,
  "@za38.03/agent-ui-plugins/generative-ui.css": `${workspaceRoot}packages/plugins/src/internal/vendor-generated/assistant-ui/generative-ui/generative-ui.css`,
  "@za38.03/agent-ui-plugins/generative-ui": `${workspaceRoot}packages/plugins/src/generative-ui.ts`,
  "@za38.03/agent-ui-plugins/theme": `${workspaceRoot}packages/plugins/src/theme/theme-contract.ts`,
  "@za38.03/agent-ui-plugins/demo-attachments": `${workspaceRoot}packages/plugins/src/demo-attachments.ts`,
  "@za38.03/agent-ui-plugins/styles.css": `${workspaceRoot}packages/plugins/src/styles.css`,
  "@za38.03/agent-ui-plugins/lexical": `${workspaceRoot}packages/plugins/src/lexical.tsx`,
  "@za38.03/agent-ui-plugins": `${workspaceRoot}packages/plugins/src/index.ts`,
  "@za38.03/agent-ui-runtime": `${workspaceRoot}packages/runtime/src/index.ts`,
  "@za38.03/agent-ui-core": `${workspaceRoot}packages/core/src/index.ts`,
  "@za38.03/agent-ui-renderer": `${workspaceRoot}packages/renderer/src/index.ts`,
};
