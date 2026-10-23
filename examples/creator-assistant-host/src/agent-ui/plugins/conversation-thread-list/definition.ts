import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/conversation-thread-list";
import { ConversationThreadListPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: ["agent-ui.conversations"], optionalInject: ["agent-ui.theme","agent-ui.locale"], Component: ConversationThreadListPlugin };
export default definition;
