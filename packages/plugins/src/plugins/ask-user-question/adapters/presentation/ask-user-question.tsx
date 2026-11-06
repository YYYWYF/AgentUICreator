import { useAgentUILocale } from '../../../../plugin-support.js';
import {
  ConversationQuestionFlow,
  useConversationCanAnswerToolCall,
  type ConversationToolCallProps,
  type UIPluginElementProps,
} from '../../../../public.js';
import { parseHumanQuestionRequest, parseHumanQuestionResult } from './contract.js';
import { HumanQuestionFlow } from './question-flow.js';

export interface AskUserQuestionProps extends ConversationToolCallProps, UIPluginElementProps {}

export function CanonicalAskUserQuestion(props: AskUserQuestionProps) {
  const labels = useAgentUILocale('humanQuestion');
  const wrap = (content: import('react').ReactNode) => (
    <div
      className={props.className}
      style={props.style}
      id={props.id}
      role={props.role}
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby']}
      onClick={props.onClick}
    >
      {content}
    </div>
  );
  const canAnswer = useConversationCanAnswerToolCall();
  const request = parseHumanQuestionRequest(props.args);
  if (request === undefined) {
    return wrap(<p>{labels.unavailable}</p>);
  }

  const result = parseHumanQuestionResult(props.result, request);
  if (props.result !== undefined && result === undefined) {
    return wrap(<p>{labels.unavailable}</p>);
  }

  const waiting =
    result === undefined &&
    props.status.type === 'requires-action' &&
    canAnswer &&
    typeof props.addResult === 'function';
  const onComplete = waiting ? (answers: Record<string, string[]>) => props.addResult!({ answers }) : undefined;
  return wrap(
    request.steps.some((step) => step.selectionMode === 'text') ? (
      <HumanQuestionFlow steps={request.steps} choice={result?.answers} labels={labels} onComplete={onComplete} />
    ) : (
      <ConversationQuestionFlow
        steps={request.steps.map((step) => ({ ...step, selectionMode: step.selectionMode as 'single' | 'multiple' }))}
        choice={result?.answers}
        onComplete={onComplete}
      />
    ),
  );
}
