import { askUserQuestionParameters } from '@za38.03/agent-ui-plugins';
import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AskUserQuestionPlugin } from './index';
import manifestJson from './manifest.json';

export const askUserQuestionPlugin = {
  manifest: parseUIPluginManifest(manifestJson),
  toolkit: {
    ask_user_question: {
      type: 'human',
      display: 'standalone',
      description: "Collect structured choices or text input and return the user's response as the tool result.",
      parameters: askUserQuestionParameters,
      render: AskUserQuestionPlugin,
    },
  },
  Component: () => null,
} satisfies UIPluginDefinition;
export {
  askUserQuestionParameters,
  parseHumanQuestionRequest,
  parseHumanQuestionResult,
} from '@za38.03/agent-ui-plugins';
export type {
  HumanQuestionOption,
  HumanQuestionRequest,
  HumanQuestionResult,
  HumanQuestionStep,
} from '@za38.03/agent-ui-plugins';
export default askUserQuestionPlugin;
