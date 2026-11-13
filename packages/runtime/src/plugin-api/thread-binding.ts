import type {
  ConversationThreadBinding,
  ConversationRunResume,
  ConversationMessage,
} from "../threads/types.js";
export const AGENT_UI_THREAD_BINDING_SERVICE = "agent-ui.thread-binding";
/** Feature-owned source detail is opaque to the canonical Runtime. */
export type ConversationRunResumeProvider<TState = unknown> = {
  provide(snapshot: {
    threadId: string;
    detail: unknown;
    messages: readonly ConversationMessage[];
    state?: TState | undefined;
  }):
    | Promise<ConversationRunResume | undefined>
    | ConversationRunResume
    | undefined;
}["provide"];
export interface ConversationThreadBindingOptions {
  initialThreadId?: string | undefined;
  currentThreadId?: string | undefined;
  resumeProvider?: ConversationRunResumeProvider | undefined;
}
export type DisposableConversationThreadBinding = ConversationThreadBinding & {
  dispose?(): void;
};
export type ConversationThreadBindingFactory = (
  options: ConversationThreadBindingOptions,
) => DisposableConversationThreadBinding;
declare module "@za38.03/agent-ui-runtime/contracts" {
  interface UIPluginServiceMap {
    [AGENT_UI_THREAD_BINDING_SERVICE]: ConversationThreadBindingFactory;
  }
}
