import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { askUserQuestionParameters } from "../../agent-contract/human-tools/ask-user-question";
import { AskUserQuestionToolUI } from "../../agent-ui/conversation/human-tool-uis/ask-user-question";
import manifest from "./manifest.json";

export default {
  manifest: parseUIPluginManifest(manifest),
  toolkit: {
    ask_user_question: {
      type: "human",
      interaction: { type: "interrupt" },
      display: "standalone",
      description: "Pause for structured choices or text input, then resume with the user response.",
      parameters: askUserQuestionParameters,
      render: AskUserQuestionToolUI,
    },
  },
  Component: () => null,
} satisfies UIPluginDefinition;
