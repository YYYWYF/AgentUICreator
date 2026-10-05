import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { AssistantUiLexicalComposerInput } from "./index";
import manifestJson from "./manifest.json";

export const assistantUiLexicalComposerInputPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AssistantUiLexicalComposerInput,
};
export default assistantUiLexicalComposerInputPlugin;
