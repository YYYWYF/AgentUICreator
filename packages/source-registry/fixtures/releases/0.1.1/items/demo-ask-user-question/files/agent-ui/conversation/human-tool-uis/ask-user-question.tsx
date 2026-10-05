import {
  ConversationQuestionFlow,
  useConversationCanAnswerToolCall,
  type ConversationToolCallProps,
} from "@agent-ui/react";
import { useAgentUILocale } from "../../i18n/useAgentUILocale";
import { parseHumanQuestionRequest, parseHumanQuestionResult } from "../../../agent-contract/human-tools/ask-user-question";

export function AskUserQuestionToolUI(props: ConversationToolCallProps) {
  const labels = useAgentUILocale("humanQuestion");
  const canAnswer = useConversationCanAnswerToolCall();
  const request = parseHumanQuestionRequest(props.args);
  if (request === undefined) return <p>{labels.unavailable}</p>;

  const result = parseHumanQuestionResult(props.result, request);
  if (props.result !== undefined && result === undefined) return <p>{labels.unavailable}</p>;

  const waiting = result === undefined && props.status.type === "requires-action" &&
    canAnswer && typeof props.addResult === "function";
  return <ConversationQuestionFlow
    steps={request.steps}
    choice={result?.answers}
    labels={labels}
    onComplete={waiting ? answers => props.addResult?.({ answers }) : undefined}
  />;
}
