import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { collectUserDetailsParameters } from "../../agent-contract/human-tools/collect-user-details";
import { CollectUserDetailsToolUI } from "../../agent-ui/conversation/human-tool-uis/collect-user-details";
import manifest from "./manifest.json";

export default {
  manifest: parseUIPluginManifest(manifest),
  toolkit: {
    collect_user_details: {
      type: "human", display: "standalone",
      description: "Collect personal details in a conversation form and return the user's validated submission as the tool result.",
      parameters: collectUserDetailsParameters, render: CollectUserDetailsToolUI,
    },
  },
  Component: () => null,
} satisfies UIPluginDefinition;
