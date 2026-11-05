// @vitest-environment jsdom
import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { DataMessageUIRegistration, defineDataMessageUI } from "../src/internal/data-message-ui";
import { AgentUILocaleProvider, useAgentUILocaleCode } from "../src/locale";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; });
const adapter: ChatModelAdapter = { async *run() {} };
const messages: ThreadMessageLike[] = [{
  role: "assistant",
  content: [{ type: "data", name: "test.report", data: { value: 42 } }],
  status: { type: "complete", reason: "stop" },
}];

function Report() {
  const locale = useAgentUILocaleCode();
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(value => value + 1)}>{locale}:{count}</button>;
}
function Replacement() { return <button>replacement</button>; }
const definition = defineDataMessageUI({ name: "test.report", render: Report });
const replacement = defineDataMessageUI({ name: "test.report", render: Replacement });
function Message() { return <MessagePrimitive.Parts />; }
const components = { Message };
function Harness({ locale, registration = definition }: {
  locale: "zh-CN" | "en-US";
  registration?: typeof definition | null;
}) {
  const runtime = useLocalRuntime(adapter, { initialMessages: messages });
  return <AssistantRuntimeProvider runtime={runtime}>
    <AgentUILocaleProvider locale={locale}>
      {registration && <DataMessageUIRegistration definition={registration} />}
      <ThreadPrimitive.Messages components={components} />
    </AgentUILocaleProvider>
  </AssistantRuntimeProvider>;
}

describe("Data Message UI renderer lifetime", () => {
  it("preserves interaction state across parent and locale updates", async () => {
    await act(async () => { renderer = create(<Harness locale="zh-CN" />); });
    await act(async () => renderer!.root.findByType("button").props.onClick());
    expect(renderer!.root.findByType("button").children).toEqual(["zh-CN", ":", "1"]);
    await act(async () => renderer!.update(<Harness locale="zh-CN" />));
    expect(renderer!.root.findByType("button").children).toEqual(["zh-CN", ":", "1"]);
    await act(async () => renderer!.update(<Harness locale="en-US" />));
    expect(renderer!.root.findByType("button").children).toEqual(["en-US", ":", "1"]);
  });

  it("still replaces and removes an explicitly changed registration", async () => {
    await act(async () => { renderer = create(<Harness locale="zh-CN" />); });
    await act(async () => renderer!.update(<Harness locale="en-US" registration={replacement} />));
    expect(renderer!.root.findByType("button").children).toEqual(["replacement"]);
    await act(async () => renderer!.update(<Harness locale="en-US" registration={null} />));
    expect(renderer!.root.findAllByType("button")).toHaveLength(0);
  });
});
