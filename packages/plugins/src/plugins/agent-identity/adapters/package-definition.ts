import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AgentIdentityPlugin } from "./index";
import manifestJson from "./manifest.json";
export const agentIdentityPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: [], optionalInject: ["agent-ui.locale"], Component: AgentIdentityPlugin } satisfies UIPluginDefinition;
export default agentIdentityPlugin;
