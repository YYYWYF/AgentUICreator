import { CanonicalAskUserQuestion, type AskUserQuestionProps } from '@za38.03/agent-ui-plugins';

export function AskUserQuestionPlugin(props: AskUserQuestionProps) {
  return <CanonicalAskUserQuestion {...props} />;
}
