import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiReasoningPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiReasoningPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiReasoningPlugin,
};

export default assistantUiReasoningPlugin;
