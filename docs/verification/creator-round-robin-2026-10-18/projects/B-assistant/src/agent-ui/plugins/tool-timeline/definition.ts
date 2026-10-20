import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "./source/definition";
import { ConversationToolTimelinePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], Component: ConversationToolTimelinePlugin };
export default definition;
