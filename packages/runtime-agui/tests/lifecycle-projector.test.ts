import { EventType, type Message } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { LifecycleProjector } from "../src/lifecycle-projector.js";

describe("LifecycleProjector", () => {
  it("projects independent tool state machines and explicit tool errors", () => {
    const projector = new LifecycleProjector();

    projector.onToolCallStart({
      type: EventType.TOOL_CALL_START,
      toolCallId: "tool-a",
      toolCallName: "search",
      parentMessageId: "assistant-a",
    });
    projector.onToolCallArgs({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "tool-a",
      delta: '{"query":',
    });
    projector.onToolCallStart({
      type: EventType.TOOL_CALL_START,
      toolCallId: "tool-b",
      toolCallName: "render",
      subagentRunId: "designer",
    });
    projector.onToolCallEnd({
      type: EventType.TOOL_CALL_END,
      toolCallId: "tool-a",
    });
    projector.onToolCallResult({
      type: EventType.TOOL_CALL_RESULT,
      messageId: "tool-result-a",
      toolCallId: "tool-a",
      content: "results",
    });

    expect(projector.getExecutions()).toMatchObject([
      {
        type: "tool",
        id: "tool-a",
        status: "completed",
        arguments: '{"query":',
        result: { messageId: "tool-result-a", content: "results" },
      },
      {
        type: "tool",
        id: "tool-b",
        producer: { type: "subagent", id: "designer" },
        status: "preparing",
      },
    ]);

    projector.onToolCallEnd({
      type: EventType.TOOL_CALL_END,
      toolCallId: "tool-b",
      subagentRunId: "designer",
    });
    projector.onToolCallResult({
      type: EventType.TOOL_CALL_RESULT,
      messageId: "tool-result-b",
      toolCallId: "tool-b",
      content: "backend failure",
      subagentRunId: "designer",
    });
    projector.projectMessages([{
      id: "tool-result-b",
      role: "tool",
      toolCallId: "tool-b",
      content: "backend failure",
      error: "Render failed",
      subagentRunId: "designer",
    }]);

    expect(projector.getExecutions()[1]).toMatchObject({
      type: "tool",
      status: "error",
      error: { message: "Render failed" },
    });
  });

  it("keeps reasoning phases separate from reasoning and text message streams", () => {
    const projector = new LifecycleProjector();

    projector.onReasoningStart({
      type: EventType.REASONING_START,
      messageId: "root-reasoning",
    });
    projector.onReasoningStart({
      type: EventType.REASONING_START,
      messageId: "child-reasoning",
      subagentRunId: "researcher",
    });
    projector.onReasoningMessageStart({
      type: EventType.REASONING_MESSAGE_START,
      messageId: "root-thought",
      role: "reasoning",
    });
    projector.onReasoningMessageStart({
      type: EventType.REASONING_MESSAGE_START,
      messageId: "child-thought",
      role: "reasoning",
      subagentRunId: "researcher",
    });
    projector.onReasoningMessageStart({
      type: EventType.REASONING_MESSAGE_START,
      messageId: "orphan-thought",
      role: "reasoning",
      subagentRunId: "unknown-child",
    });
    projector.onReasoningMessageEnd({
      type: EventType.REASONING_MESSAGE_END,
      messageId: "root-thought",
    });
    projector.onTextMessageStart({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "assistant-stream",
      role: "assistant",
      subagentRunId: "researcher",
    });
    projector.onTextMessageContent({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "assistant-stream",
      delta: "Answering",
      subagentRunId: "researcher",
    });
    projector.onReasoningMessageContent({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: "child-thought",
      delta: "Child thought",
      subagentRunId: "researcher",
    });

    const messages = projector.projectMessages([
      {
        id: "root-thought",
        role: "reasoning",
        content: "Root thought",
      },
      {
        id: "child-thought",
        role: "reasoning",
        content: "Child thought",
        subagentRunId: "researcher",
      },
      {
        id: "orphan-thought",
        role: "reasoning",
        content: "Unassociated thought",
        subagentRunId: "unknown-child",
      },
      {
        id: "assistant-stream",
        role: "assistant",
        content: "Answering",
        subagentRunId: "researcher",
      },
    ]);

    expect(projector.getExecutions()).toMatchObject([
      {
        id: "root-reasoning",
        status: "running",
        messageIds: ["root-thought"],
      },
      {
        id: "child-reasoning",
        status: "running",
        messageIds: ["child-thought"],
      },
    ]);
    expect(messages).toMatchObject([
      { id: "root-thought", streamStatus: "completed" },
      {
        id: "child-thought",
        producer: { type: "subagent", id: "researcher" },
        streamStatus: "streaming",
      },
      { id: "orphan-thought", streamStatus: "streaming" },
      {
        id: "assistant-stream",
        producer: { type: "subagent", id: "researcher" },
        streamStatus: "streaming",
      },
    ]);

    projector.onTextMessageEnd({
      type: EventType.TEXT_MESSAGE_END,
      messageId: "assistant-stream",
      subagentRunId: "researcher",
    });
    expect(projector.projectMessages([{
      id: "assistant-stream",
      role: "assistant",
      content: "Answering",
      subagentRunId: "researcher",
    }])).toMatchObject([{ streamStatus: "completed" }]);
    expect(projector.getExecutions()[0]).toMatchObject({ status: "running" });

    projector.onReasoningEnd({
      type: EventType.REASONING_END,
      messageId: "root-reasoning",
    });
    expect(projector.getExecutions()[0]).toMatchObject({ status: "completed" });
    expect(projector.getExecutions()[1]).toMatchObject({ status: "running" });
  });

  it("uses producer-aware step identity and preserves nested subagent ownership", () => {
    const projector = new LifecycleProjector();

    projector.onSubagentStarted({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "subagent-a",
      name: "Researcher",
    });
    projector.onSubagentStarted({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "subagent-b",
      name: "Verifier",
      parentSubagentRunId: "subagent-a",
      parentToolCallId: "delegate-tool",
      parentMessageId: "delegate-message",
    });
    projector.onSubagentStarted({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "subagent-c",
      name: "Writer",
    });
    projector.onStepStarted({
      type: EventType.STEP_STARTED,
      stepName: "search",
    });
    projector.onStepStarted({
      type: EventType.STEP_STARTED,
      stepName: "search",
      subagentRunId: "subagent-a",
    });
    projector.onStepFinished({
      type: EventType.STEP_FINISHED,
      stepName: "search",
    });
    projector.onStepStarted({
      type: EventType.STEP_STARTED,
      stepName: "search",
    });

    const steps = projector.getExecutions().filter(
      (execution) => execution.type === "step",
    );
    expect(steps).toHaveLength(3);
    expect(new Set(steps.map((step) => step.id)).size).toBe(3);
    expect(steps).toMatchObject([
      { producer: { type: "root" }, status: "completed" },
      {
        producer: { type: "subagent", id: "subagent-a" },
        status: "running",
      },
      { producer: { type: "root" }, status: "running" },
    ]);

    projector.onSubagentFinished({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: "subagent-b",
      outcome: { type: "suspended" },
    });
    projector.onSubagentFinished({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: "subagent-c",
      outcome: { type: "success" },
    });
    projector.onSubagentError({
      type: EventType.SUBAGENT_ERROR,
      subagentRunId: "subagent-a",
      message: "Research failed",
      code: "RESEARCH_FAILED",
    });
    const subagents = projector.getExecutions().filter(
      (execution) => execution.type === "subagent",
    );
    expect(subagents).toMatchObject([
      {
        id: "subagent-a",
        producer: { type: "root" },
        status: "error",
        error: { message: "Research failed", code: "RESEARCH_FAILED" },
      },
      {
        id: "subagent-b",
        producer: { type: "subagent", id: "subagent-a" },
        parentSubagentId: "subagent-a",
        parentToolId: "delegate-tool",
        parentMessageId: "delegate-message",
        status: "suspended",
      },
      {
        id: "subagent-c",
        producer: { type: "root" },
        status: "completed",
      },
    ]);
  });

  it("keeps activity in messages and settles active loading on terminal paths", () => {
    const projector = new LifecycleProjector();
    projector.onToolCallStart({
      type: EventType.TOOL_CALL_START,
      toolCallId: "tool-active",
      toolCallName: "search",
      subagentRunId: "worker",
    });
    projector.onReasoningStart({
      type: EventType.REASONING_START,
      messageId: "reasoning-active",
    });
    projector.onStepStarted({
      type: EventType.STEP_STARTED,
      stepName: "compose",
    });
    projector.onTextMessageStart({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "text-active",
      role: "assistant",
    });

    const activity: Message = {
      id: "activity",
      role: "activity",
      activityType: "SEARCH",
      content: { status: "running" },
      subagentRunId: "worker",
    };
    expect(projector.projectMessages([activity])).toMatchObject([
      {
        role: "activity",
        producer: { type: "subagent", id: "worker" },
        content: { status: "running" },
      },
    ]);
    expect(projector.getExecutions().some(
      (execution) => execution.id === "activity",
    )).toBe(false);

    projector.interruptActive();
    expect(projector.getExecutions().map((execution) => execution.status))
      .toEqual(["interrupted", "interrupted", "interrupted"]);
    expect(projector.projectMessages([{
      id: "text-active",
      role: "assistant",
      content: "Partial",
    }])).toMatchObject([{ streamStatus: "completed" }]);

    projector.resetForRun();
    expect(projector.getExecutions()).toEqual([]);
    expect(projector.projectMessages([{
      id: "text-active",
      role: "assistant",
      content: "Partial",
    }])).toMatchObject([{ streamStatus: "completed" }]);

    projector.resetConversation();
    expect(projector.projectMessages([{
      id: "text-active",
      role: "assistant",
      content: "Partial",
    }])[0]).not.toHaveProperty("streamStatus");
  });
});
