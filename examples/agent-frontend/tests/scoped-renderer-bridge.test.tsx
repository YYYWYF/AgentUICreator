import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ScopedReasoningGroup,
  ScopedRendererBridgeProvider,
  ScopedTaskGroup,
  ScopedToolFallback,
  ScopedToolGroup,
} from "../agent-ui/conversation/ScopedRendererBridge";
import type { UIPluginRenderScope } from "../framework/contracts/ui-plugin";
import {
  PluginRenderScopeProvider,
  usePluginRenderScope,
} from "../runtime/plugins";

function ScopeReader() {
  const scope = usePluginRenderScope<string>();
  return <span>{scope?.value ?? "none"}</span>;
}

describe("scoped renderer bridge", () => {
  it("renders no presentation when the Renderer Bridge is absent", () => {
    const tool = {
      toolCallId: "tool-1",
      toolName: "unknown_tool",
      args: { query: "hello" },
      argsText: '{"query":"hello"}',
      result: { ok: false },
      isError: true,
      onApprove: () => undefined,
      status: { type: "incomplete" as const, reason: "error" },
    };
    expect(renderToStaticMarkup(
      <>
        <ScopedReasoningGroup group={{ type: "group-reasoning", indices: [0], status: { type: "complete" } }}>
          reasoning
        </ScopedReasoningGroup>
        <ScopedToolGroup group={{ type: "group-tool", indices: [1], status: { type: "complete" } }}>
          tools
        </ScopedToolGroup>
        <ScopedToolFallback {...tool} />
      </>,
    )).toBe("");
  });

  it("isolates repeated entities and restores the parent scope after nesting", () => {
    const a: UIPluginRenderScope<string> = { kind: "sample", value: "A" };
    const b: UIPluginRenderScope<string> = { kind: "sample", value: "B" };
    expect(renderToStaticMarkup(
      <PluginRenderScopeProvider scope={a}>
        <ScopeReader />
        <PluginRenderScopeProvider scope={b}><ScopeReader /></PluginRenderScopeProvider>
        <ScopeReader />
      </PluginRenderScopeProvider>,
    )).toBe("<span>A</span><span>B</span><span>A</span>");
  });

  it("passes group status, order, children and tool call fields into separate scopes", () => {
    const observed: Array<{ slot: string; scope: UIPluginRenderScope }> = [];
    const renderScopedSlot = (slot: string, scope: UIPluginRenderScope) => {
      observed.push({ slot, scope });
      return <span>{slot}</span>;
    };
    const tool = {
      toolCallId: "tool-1",
      toolName: "unknown_tool",
      args: { query: "hello" },
      argsText: '{"query":"hello"}',
      result: { ok: false },
      isError: true,
      onApprove: () => undefined,
      status: { type: "incomplete" as const, reason: "error" },
    };
    renderToStaticMarkup(
      <ScopedRendererBridgeProvider renderScopedSlot={renderScopedSlot}>
        <ScopedReasoningGroup group={{ type: "group-reasoning", indices: [0, 1], status: { type: "running" } }}>reasoning A</ScopedReasoningGroup>
        <ScopedToolGroup group={{ type: "group-tool", indices: [2, 3], status: { type: "complete" } }}>tools A</ScopedToolGroup>
        <ScopedReasoningGroup group={{ type: "group-reasoning", indices: [4], status: { type: "complete" } }}>reasoning B</ScopedReasoningGroup>
        <ScopedToolFallback {...tool} />
      </ScopedRendererBridgeProvider>,
    );
    expect(observed.map(({ slot }) => slot)).toEqual(["reasoningGroup", "toolGroup", "reasoningGroup", "toolFallback"]);
    expect(observed[0]?.scope).toMatchObject({ kind: "conversation.reasoning-group", value: {
      group: { indices: [0, 1], status: { type: "running" } }, children: "reasoning A",
    } });
    expect(observed[1]?.scope).toMatchObject({ kind: "conversation.tool-group", value: {
      group: { indices: [2, 3], status: { type: "complete" } }, children: "tools A",
    } });
    expect(observed[2]?.scope).toMatchObject({ kind: "conversation.reasoning-group", value: {
      group: { indices: [4] }, children: "reasoning B",
    } });
    expect(observed[3]?.scope).toMatchObject({ kind: "conversation.tool-fallback", value: { tool } });
  });

  it("routes the official task group seam with ordinary-tool fallback", () => {
    const observed: Array<{
      slot: string;
      scope: UIPluginRenderScope;
      fallback?: unknown;
    }> = [];
    const renderScopedSlot = (
      slot: string,
      scope: UIPluginRenderScope,
      fallback?: unknown,
    ) => {
      observed.push({ slot, scope, fallback });
      return <span>{slot}</span>;
    };
    renderToStaticMarkup(
      <ScopedRendererBridgeProvider renderScopedSlot={renderScopedSlot}>
        <ScopedTaskGroup group={{ type: "group-task", indices: [0], counts: { running: 0, requiresAction: 0 } }}>
          <span>ordinary tool</span>
        </ScopedTaskGroup>
      </ScopedRendererBridgeProvider>,
    );

    expect(observed.map(({ slot }) => slot)).toEqual(["taskGroup"]);
    expect(observed[0]?.scope).toMatchObject({
      kind: "conversation.task-group",
      value: { group: { type: "group-task", indices: [0] }, children: expect.anything() },
    });
    expect(observed[0]?.fallback).toBeDefined();
  });
});
