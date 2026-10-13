import {
  ConversationQuestionFlow,
  useConversationCanAnswerToolCall,
  type ConversationToolCallProps,
} from "@agent-ui/react";
import { InterruptQuestionFlow } from "./interrupt-question-flow";
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
    canAnswer && typeof props.resumeInterrupt === "function";
  const onComplete = waiting ? (answers: Record<string, string[]>) => props.resumeInterrupt!({ answers }) : undefined;
  return request.steps.some(step => step.selectionMode === "text")
    ? <InterruptQuestionFlow steps={request.steps} choice={result?.answers} labels={labels} onComplete={onComplete} />
    : <ConversationQuestionFlow
        steps={request.steps.map(step => ({ ...step, selectionMode: step.selectionMode as "single" | "multiple" }))}
        choice={result?.answers} labels={labels} onComplete={onComplete} />;
}
