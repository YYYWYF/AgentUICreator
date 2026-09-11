import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { parseUIPluginManifest } from "../../framework/contracts/ui-plugin";
import { AgentMessageAttachmentsPlugin } from "./index";
import manifestJson from "./manifest.json";

export const agentMessageAttachmentsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: AgentMessageAttachmentsPlugin,
};

export default agentMessageAttachmentsPlugin;
