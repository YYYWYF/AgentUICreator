import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiLexicalEditComposer } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiLexicalEditComposerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiLexicalEditComposer,
};
export default assistantUiLexicalEditComposerPlugin;
