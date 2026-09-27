import { fileURLToPath } from "node:url";
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
export const runtimeAliases = {
  "@agent-ui/react/styles.css": `${workspaceRoot}packages/react/src/styles.css`,
  "@agent-ui/react": `${workspaceRoot}packages/react/src/index.ts`,
  "@agent-ui/runtime-conversation": `${workspaceRoot}packages/runtime-conversation/src/index.ts`,
  "@agent-ui/runtime-core": `${workspaceRoot}packages/runtime-core/src/index.ts`,
  "@agent-ui/runtime-react": `${workspaceRoot}packages/runtime-react/src/index.ts`,
};
