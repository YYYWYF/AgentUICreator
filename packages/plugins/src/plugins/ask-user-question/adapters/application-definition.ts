import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/ask-user-question';
import { AskUserQuestionPlugin } from './index';

const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  toolkit: {
    ask_user_question: { ...implementation.toolkit.ask_user_question, render: AskUserQuestionPlugin },
  },
  Component: () => null,
};
export default definition;
