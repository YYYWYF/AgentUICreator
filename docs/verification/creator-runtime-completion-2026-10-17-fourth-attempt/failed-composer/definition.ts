import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "./source/definition";
import { ConversationComposerPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, optionalInject: ["agent-ui.locale"], Component: ConversationComposerPlugin };
export default definition;
