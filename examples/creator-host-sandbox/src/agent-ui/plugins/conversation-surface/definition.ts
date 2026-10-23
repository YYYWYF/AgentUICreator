import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/conversation-surface";
import { ConversationSurfacePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: ["agent-ui.conversations"], optionalInject: ["agent-ui.theme", "agent-ui.locale"], Component: ConversationSurfacePlugin };
export default definition;
