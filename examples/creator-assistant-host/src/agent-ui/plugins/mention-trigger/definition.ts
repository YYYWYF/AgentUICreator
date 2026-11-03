import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/mention-trigger";
import { ConversationMentionTrigger } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: ["agent-ui.locale", "conversation.mention-source"], Component: ConversationMentionTrigger };
export default definition;
