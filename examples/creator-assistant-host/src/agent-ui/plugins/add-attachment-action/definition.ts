import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/add-attachment-action";
import { ConversationAddAttachmentActionPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], Component: ConversationAddAttachmentActionPlugin };
export default definition;
