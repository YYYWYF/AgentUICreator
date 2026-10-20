import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/conversation-history";
import { ConversationHistoryPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: ["agent-ui.conversations"], optionalInject: ["agent-ui.locale"], Component: ConversationHistoryPlugin };
export default definition;
