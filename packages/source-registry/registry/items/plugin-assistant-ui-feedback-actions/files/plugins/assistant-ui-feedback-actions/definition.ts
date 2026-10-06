import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiFeedbackActionsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiFeedbackActionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiFeedbackActionsPlugin,
};

export default assistantUiFeedbackActionsPlugin;
