import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/conversation-new";
import { ConversationNewPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], Component: ConversationNewPlugin };
export default definition;
