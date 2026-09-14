export class UnsupportedAgentInputError extends Error {
  readonly code = "AGENT_UI_UNSUPPORTED_INPUT";

  constructor(kind: string) {
    super(`Conversation runtime does not support ${kind} input yet`);
    this.name = "UnsupportedAgentInputError";
  }
}

export class AgentUiRuntimeBusyError extends Error {
  readonly code = "AGENT_UI_RUNTIME_BUSY";

  constructor() {
    super("The conversation runtime is already handling an operation");
    this.name = "AgentUiRuntimeBusyError";
  }
}
