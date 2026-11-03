import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/composer";
import { ConversationComposerPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: ["agent-ui.locale"], Component: ConversationComposerPlugin };
export default definition;
