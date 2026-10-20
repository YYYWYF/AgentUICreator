import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";
import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { ContextRetrievalMessagePlugin } from "./index";
import manifestJson from "./manifest.json";

export const contextRetrievalMessagePlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [defineDataMessageUI<unknown>({
    name: "CONTEXT_CONTENT",
    render: ContextRetrievalMessagePlugin,
  })],
  Component: () => null,
};

export default contextRetrievalMessagePlugin;
