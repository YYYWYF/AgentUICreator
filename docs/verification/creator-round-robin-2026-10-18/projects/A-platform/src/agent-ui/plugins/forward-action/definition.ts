import {
  parseUIPluginManifest,
  type UIPluginDefinition,
} from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { ConversationForwardActionPlugin } from "./index";
import manifestJson from "./manifest.json";

const definition: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [],
  inject: [],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ConversationForwardActionPlugin,
};
export default definition;
