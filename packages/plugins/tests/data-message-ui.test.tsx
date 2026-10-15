// @vitest-environment jsdom

import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  DataMessageUIRegistration,
  defineDataMessageUI,
} from "../src/index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const adapter: ChatModelAdapter = { async *run() {} };
const roots: Root[] = [];
const chart = defineDataMessageUI<{ value: number }>({
  name: "chart",
  render: ({ data }) => <span data-testid="chart-value">{data.value}</span>,
});

function Thread({
  name,
  registered,
}: {
  name: string;
  registered: boolean;
}) {
  const messages: ThreadMessageLike[] = [{
    role: "assistant",
    content: [{ type: "data", name, data: { value: 42 } }],
    status: { type: "complete", reason: "stop" },
  }];
  const runtime = useLocalRuntime(adapter, { initialMessages: messages });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {registered ? <DataMessageUIRegistration definition={chart} /> : null}
      <ThreadPrimitive.Messages components={{
        Message: () => <MessagePrimitive.Parts />,
      }} />
    </AssistantRuntimeProvider>
  );
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentUI Data Message UI facade", () => {
  it("returns the typed definition unchanged", () => {
    const render = chart.render;
    expect(defineDataMessageUI({ name: "chart", render })).toEqual({ name: "chart", render });
  });

  it("renders matching data parts and cleans up on unmount", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => root.render(<Thread name="chart" registered />));
    expect(container.querySelector('[data-testid="chart-value"]')?.textContent).toBe("42");

    await act(async () => root.render(<Thread name="chart" registered={false} />));
    expect(container.querySelector('[data-testid="chart-value"]')).toBeNull();
  });

  it("leaves an unknown data part empty without a fallback", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => root.render(<Thread name="unknown" registered />));
    expect(container.querySelector('[data-testid="chart-value"]')).toBeNull();
  });
});
