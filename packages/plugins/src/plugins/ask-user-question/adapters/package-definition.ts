import { parseUIPluginManifest, type UIPluginDefinition } from '../../framework/contracts/ui-plugin';
import { askUserQuestionParameters } from './adapters/contract';
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
export { askUserQuestionParameters, parseHumanQuestionRequest, parseHumanQuestionResult } from './adapters/contract';
export type {
  HumanQuestionOption,
  HumanQuestionRequest,
  HumanQuestionResult,
  HumanQuestionStep,
} from './adapters/contract';
export default askUserQuestionPlugin;
