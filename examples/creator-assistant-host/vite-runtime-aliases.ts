import { fileURLToPath } from "node:url";
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
export const runtimeAliases = {
  "@za38.03/agent-ui-react/demo-attachments": `${workspaceRoot}packages/react/src/demo-attachments.ts`,
  "@za38.03/agent-ui-react/styles.css": `${workspaceRoot}packages/react/src/styles.css`,
  "@za38.03/agent-ui-react/lexical": `${workspaceRoot}packages/react/src/lexical.tsx`,
  "@za38.03/agent-ui-react": `${workspaceRoot}packages/react/src/index.ts`,
  "@za38.03/agent-ui-runtime": `${workspaceRoot}packages/runtime/src/index.ts`,
  "@za38.03/agent-ui-runtime-core": `${workspaceRoot}packages/runtime-core/src/index.ts`,
  "@za38.03/agent-ui-renderer": `${workspaceRoot}packages/renderer/src/index.ts`,
};
