import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/tool-fallback";
import { ConversationToolFallbackPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], Component: ConversationToolFallbackPlugin };
export default definition;
