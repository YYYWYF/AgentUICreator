import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { askUserQuestionParameters } from "../../agent-contract/human-tools/ask-user-question";
import { AskUserQuestionToolUI } from "../../agent-ui/conversation/human-tool-uis/ask-user-question";
import manifest from "./manifest.json";

export default {
  manifest: parseUIPluginManifest(manifest),
  toolkit: {
    ask_user_question: {
      type: "human",
      display: "standalone",
      description: "Ask the user to choose among structured options before continuing.",
      parameters: askUserQuestionParameters,
      render: AskUserQuestionToolUI,
    },
  },
  Component: () => null,
} satisfies UIPluginDefinition;
