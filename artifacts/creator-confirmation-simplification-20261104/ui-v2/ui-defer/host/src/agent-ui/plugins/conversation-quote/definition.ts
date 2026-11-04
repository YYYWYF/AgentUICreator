import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/conversation-quote";
import { ConversationQuotePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: ["agent-ui.locale"], Component: ConversationQuotePlugin };
export default definition;
