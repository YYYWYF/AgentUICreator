import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/tool-timeline";
import { ConversationToolTimelinePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], Component: ConversationToolTimelinePlugin };
export default definition;
