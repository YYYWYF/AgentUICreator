import { fileURLToPath } from "node:url";
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
export const runtimeAliases = {
  "@za38.03/agent-ui-plugins/assistant-ui-composer": `${workspaceRoot}packages/plugins/dist/assistant-ui-composer/index.js`,
  "@za38.03/agent-ui-plugins/generative-ui.css": `${workspaceRoot}packages/plugins/src/internal/vendor/assistant-ui/generative-ui/generative-ui.css`,
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
