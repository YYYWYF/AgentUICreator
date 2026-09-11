// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AgentToolStatus } from "../agent-ui/components/tool";
import {
  createToolSummary,
  parseToolValue,
  resolveAgentToolStatus,
  resultCount,
  StructuredValue,
  ToolDetails,
  type ToolDetailsProps,
  type ToolExecution,
  type ToolResultMessage,
} from "../plugins/agent-tool/tool-presentation";

const rootProducer = { type: "root" } as const;

function toolResult(
  overrides: Partial<ToolResultMessage> = {},
): ToolResultMessage {
  return {
    id: "tool-result",
    producer: rootProducer,
    role: "tool",
    toolCallId: "tool-call",
    content: "{}",
    ...overrides,
  };
}

function toolExecution(
  status: ToolExecution["status"],
  overrides: Partial<ToolExecution> = {},
): ToolExecution {
  return {
    type: "tool",
    id: "tool-call",
    producer: rootProducer,
    name: "inspect",
    status,
    arguments: "{}",
    ...overrides,
  };
}

function renderDetails(overrides: Partial<ToolDetailsProps> = {}): string {
  return renderToStaticMarkup(
    <ToolDetails
      argumentsText='{"path":"/src"}'
      result={undefined}
      execution={undefined}
      status="completed"
      showArguments
      showResult
      {...overrides}
    />,
  );
}

describe("resolveAgentToolStatus", () => {
  it.each([
    ["preparing", "running"],
    ["awaiting-result", "running"],
    ["completed", "completed"],
    ["error", "error"],
    ["interrupted", "interrupted"],
  ] as const)("maps execution status %s to %s", (executionStatus, expected) => {
    expect(
      resolveAgentToolStatus(undefined, toolExecution(executionStatus), false),
    ).toBe(expected);
  });

  it("maps a tool result error to error without an execution", () => {
    expect(
      resolveAgentToolStatus(toolResult({ error: "boom" }), undefined, false),
    ).toBe("error");
  });

  it("maps an existing tool result to completed without an execution", () => {
    expect(resolveAgentToolStatus(toolResult(), undefined, false)).toBe(
      "completed",
    );
  });

  it("maps a running occurrence without execution to running", () => {
    expect(resolveAgentToolStatus(undefined, undefined, true)).toBe("running");
  });

  it("maps an idle occurrence without execution to interrupted", () => {
    expect(resolveAgentToolStatus(undefined, undefined, false)).toBe(
      "interrupted",
    );
  });
});

describe("createToolSummary", () => {
  it.each([
    ["running", "工具调用 · 正在执行"],
    ["error", "工具调用 · 执行失败"],
    ["interrupted", "工具调用 · 未返回结果"],
    ["completed", "工具调用 · 已完成"],
  ] as const)("summarizes %s without a result", (status, expected) => {
    expect(createToolSummary(status as AgentToolStatus, undefined)).toBe(
      expected,
    );
  });

  it("counts array results", () => {
    expect(
      createToolSummary("completed", toolResult({ content: "[1,2,3]" })),
    ).toBe("工具调用 · 3 个结果");
  });

  it("counts a single recognizable array field", () => {
    expect(
      createToolSummary(
        "completed",
        toolResult({ content: '{"files":["a","b"]}' }),
      ),
    ).toBe("工具调用 · 2 个结果");
  });

  it("falls back to a returned result for ordinary objects", () => {
    expect(
      createToolSummary(
        "completed",
        toolResult({ content: '{"total":2,"ok":true}' }),
      ),
    ).toBe("工具调用 · 已返回结果");
  });
});

describe("resultCount", () => {
  it("counts arrays and single array fields only", () => {
    expect(resultCount([1, 2, 3])).toBe(3);
    expect(resultCount({ files: ["a", "b"] })).toBe(2);
    expect(resultCount({ a: 1, b: 2 })).toBeUndefined();
    expect(resultCount("plain")).toBeUndefined();
  });
});

describe("parseToolValue", () => {
  it("parses JSON objects", () => {
    expect(parseToolValue('{"path":"/src"}')).toEqual({ path: "/src" });
  });

  it("keeps invalid JSON as the original string", () => {
    expect(parseToolValue("plain text")).toBe("plain text");
  });
});

describe("StructuredValue", () => {
  it("renders scalar strings, numbers, booleans, and null", () => {
    expect(renderToStaticMarkup(<StructuredValue value="hello" />)).toContain(
      "<code>hello</code>",
    );
    expect(renderToStaticMarkup(<StructuredValue value={3} />)).toContain(
      "<code>3</code>",
    );
    expect(renderToStaticMarkup(<StructuredValue value />)).toContain(
      "<code>true</code>",
    );
    expect(renderToStaticMarkup(<StructuredValue value={null} />)).toContain(
      "<code>null</code>",
    );
  });

  it("renders scalar arrays as a list", () => {
    const html = renderToStaticMarkup(<StructuredValue value={["a", "b"]} />);

    expect(html).toContain('data-slot="agent-tool-value-list"');
    expect(html.match(/<li>/gu)).toHaveLength(2);
  });

  it("renders nested objects as fields", () => {
    const html = renderToStaticMarkup(
      <StructuredValue value={{ outer: { inner: 1 } }} />,
    );

    expect(html.match(/data-slot="agent-tool-value-object"/gu)).toHaveLength(2);
    expect(html).toContain("<dt>outer</dt>");
    expect(html).toContain("<dt>inner</dt>");
  });

  it("renders values that cannot be structured as raw JSON", () => {
    const html = renderToStaticMarkup(<StructuredValue value={[{ x: 1 }]} />);

    expect(html).toContain('data-slot="agent-tool-raw-value"');
    expect(html).toContain("&quot;x&quot;");
  });

  it("marks file-like strings with an owned decorative icon", () => {
    const html = renderToStaticMarkup(<StructuredValue value="/src/App.tsx" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("agent-tool-plugin-file-icon");
    expect(html).toContain("<code>/src/App.tsx</code>");
  });
});

describe("ToolDetails", () => {
  it("renders the input section by default", () => {
    const html = renderDetails();

    expect(html).toContain("输入");
    expect(html).toContain("/src");
  });

  it("omits the input section when showArguments is false", () => {
    const html = renderDetails({ showArguments: false });

    expect(html).not.toContain("输入");
  });

  it("renders the output section when a result exists", () => {
    const html = renderDetails({
      result: toolResult({ content: '{"total":2}' }),
    });

    expect(html).toContain("输出");
    expect(html).toContain("<dt>total</dt>");
  });

  it("omits the output and pending sections when showResult is false", () => {
    const html = renderDetails({
      result: toolResult({ content: "done" }),
      showResult: false,
    });

    expect(html).not.toContain("输出");
    expect(html).not.toContain('data-slot="agent-tool-pending"');
  });

  it("shows a pending message while the tool is running", () => {
    const html = renderDetails({ status: "running" });

    expect(html).toContain('data-slot="agent-tool-pending"');
    expect(html).toContain("等待工具返回结果…");
  });

  it("shows a missing-result message after the tool stops", () => {
    const html = renderDetails({ status: "interrupted" });

    expect(html).toContain("工具没有返回结果");
  });

  it("surfaces result errors even when showResult is false", () => {
    const html = renderDetails({
      result: toolResult({ error: "permission denied" }),
      showResult: false,
    });

    expect(html).toContain('data-slot="agent-tool-error"');
    expect(html).toContain("工具执行失败");
    expect(html).toContain("permission denied");
    expect(html).not.toContain("输出");
  });

  it("surfaces execution errors without a result", () => {
    const html = renderDetails({
      execution: toolExecution("error", {
        error: { message: "execution exploded" },
      }),
      status: "error",
    });

    expect(html).toContain("工具执行失败");
    expect(html).toContain("execution exploded");
  });
});
