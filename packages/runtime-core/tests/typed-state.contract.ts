import {
  createAgentRuntime,
  type AgentTransport,
} from "../src/index.js";

interface MyState {
  foo: string;
}

export function typedStateContract(transport: AgentTransport<MyState>): string {
  const runtime = createAgentRuntime<MyState>({ transport });
  return runtime.getSnapshot().state.foo;
}
