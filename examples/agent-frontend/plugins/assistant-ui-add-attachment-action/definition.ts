import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiAddAttachmentActionPlugin } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiAddAttachmentActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiAddAttachmentActionPlugin,
};

export default assistantUiAddAttachmentActionPlugin;
