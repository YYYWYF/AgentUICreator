import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/theme-switch";
import { ThemeSwitchPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: ["agent-ui.theme"], optionalInject: ["agent-ui.locale"], Component: ThemeSwitchPlugin };
export default definition;
