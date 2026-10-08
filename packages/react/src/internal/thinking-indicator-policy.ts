import { hasPendingToolAction, projectToolTimeline, type TimelinePart } from "./tool-timeline-projection.js";
export interface ThinkingPresentationPolicy {
  readonly reasoningVisible: boolean;
  readonly timelineVisible: boolean;
}
export function thinkingPresentation(parts: readonly TimelinePart[], status: string | undefined, policy: ThinkingPresentationPolicy,
  namedTools: Readonly<Record<string, readonly unknown[] | undefined>> = {}): "thinking" | "working" | null {
  if (status !== "running") return null;
  // Any real answer text is a definitive handoff; hidden reasoning is retained.
  if (parts.some(part => part.type === "text" && !!part.text)) return null;
  if (parts.some(hasPendingToolAction)) return null;
  const last = parts[parts.length - 1];
  if (last?.type === "reasoning" && last.text && policy.reasoningVisible) return null;
  if (last && !["reasoning", "tool-call", "text"].includes(last.type)) return null;
  const timeline = projectToolTimeline(parts, namedTools);
  if (policy.timelineVisible && timeline.anchorId && timeline.streaming) return null;
  const runningTool = timeline.calls.some(call => call.status === "running");
  // Dedicated tools and TaskCards already expose their actual activity.
  if (timeline.calls.some(call => !call.summarized && call.status === "running")) return null;
  return runningTool ? "working" : "thinking";
}
