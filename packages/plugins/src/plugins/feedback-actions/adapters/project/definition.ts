import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { ConversationFeedbackActionsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const conversationFeedbackActionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ConversationFeedbackActionsPlugin,
};

export default conversationFeedbackActionsPlugin;
