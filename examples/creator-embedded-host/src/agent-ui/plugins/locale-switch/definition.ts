import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/locale-switch";
import { LocaleSwitchPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: ["agent-ui.locale"], optionalInject: [], Component: LocaleSwitchPlugin };
export default definition;
