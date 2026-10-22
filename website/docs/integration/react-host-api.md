---
title: "React Host API"
---

# React Host API

公开 React Host API 从 `@za38.03/agent-ui-runtime` 导入，生成的 Agent 入口复用该 Provider。Provider 与 Outlet 不创建第二个 Agent Runtime。

## 生成 Agent 参数

这些 props 属于生成项目的 Agent，导入路径取决于 sourceRoot：


```ts
export interface AgentProps {
    /** Host-controlled presentation theme; omitted uses the project theme service/default. */
    theme?: AgentUITheme | undefined;
    /** Reports theme changes requested by the UI. Update theme to accept a controlled change. */
    onThemeChange?: ((theme: AgentUITheme) => void) | undefined;
    /** Host-owned profile for account presentation. null shows the signed-out profile; omitted uses auth.session. */
    user?: AgentUser | null | undefined;
    /** Optional Host-owned page-memory notice service. Never persisted or sent to the Agent. */
    transientMessages?: ConversationRuntimeProviderProps["transientMessages"];
    /** Optional Host-owned presentation locale; never sent to AG-UI. */
    locale?: AgentUILocaleCode;
    /** Reports language changes initiated by the UI, including locale-switch. */
    onLocaleChange?: ((locale: AgentUILocaleCode) => void) | undefined;
    /** The Host application's AG-UI endpoint. Defaults to VITE_AGENT_ENDPOINT or /agent. */
    endpoint?: string;
    observability?: AgentObservability;
    /** Application errors and Agent run errors reported by the conversation provider. */
    onError?: ConversationRuntimeProviderProps["onError"];
    /** Application-owned feedback persistence. */
    feedbackAdapter?: ConversationRuntimeProviderProps["feedbackAdapter"];
    /** Application-owned official Agent UI attachment adapter. */
    attachmentAdapter?: ConversationRuntimeProviderProps["attachmentAdapter"];
    /** Application-owned official Agent UI speech-to-text adapter. */
    dictationAdapter?: ConversationRuntimeProviderProps["dictationAdapter"];
    /** Optional application-owned durable run capability for persisted conversations. */
    runResumeProvider?: ConversationRunResumeProvider<AppAgentState> | undefined;
    /** Host-owned persisted thread to reopen after refresh; omitted starts a new conversation. */
    initialThreadId?: string | undefined;
}

/** Project-only binding; the Host API and lifecycle implementation live in the runtime package. */
export interface AgentUIProviderProps extends AgentProps {
    children: ReactNode;
}
```

`AgentUITheme` 从生成的项目入口导出，取值为 `light`、`dark`、`violet`。`theme` 为受控参数；不传时使用项目主题服务与默认配置。`onThemeChange` 报告界面切换请求，具体用法见[Agent 参数与配置](./agent-options#切换主题)。

## Host 状态、方法与事件


```ts
/** Presentation only. Never forwarded to AG-UI or used to authorize a session. */
export interface AgentUIUser {
    userId?: string | undefined;
    userName?: string | undefined;
    avatar?: string | undefined;
}

export type AgentUIConnectionStatus = "initializing" | "ready" | "blocked" | "error";

export interface AgentUIHostSnapshot<TState = unknown> {
    status: AgentUIConnectionStatus;
    runtime: AgentRuntimeSnapshot<TState> | null;
}

export interface AgentUIEventMap<TState = unknown> {
    ready: {
        threadId: string;
    };
    "status-change": {
        status: AgentUIConnectionStatus;
    };
    "thread-change": {
        threadId: string;
    };
    "run-start": {
        threadId: string;
        run: AgentRuntimeSnapshot<TState>["run"];
    };
    /** End of a wire run, including interruption, cancellation and error; not a success signal. */
    "run-end": {
        threadId: string;
        run: AgentRuntimeSnapshot<TState>["run"];
    };
}

export interface AgentUIHost<TState = unknown> {
    getSnapshot(): AgentUIHostSnapshot<TState>;
    subscribe(listener: () => void): () => void;
    on<K extends keyof AgentUIEventMap<TState>>(event: K, listener: (payload: AgentUIEventMap<TState>[K]) => void): () => void;
    /** Delegates to the canonical runtime. Settlement is not proof of successful completion. */
    sendMessage(input: string | AgentUserInput): Promise<void>;
    startNewConversation(): Promise<void>;
    resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
    abortRun(): void;
}
```

| API | 使用约束 |
| --- | --- |
| `AgentUIProvider({ user, children })` | 同一 Provider 管一套 Host 环境；user 仅展示。 |
| `useAgentUI<TState>()` | 缺 Provider 抛错。 |
| `useOptionalAgentUI<TState>()` | 缺 Provider 返回 null。 |
| `useAgentUIState(selector)` | 选择稳定字段/引用。 |
| `useAgentUIEvent(event, listener)` | React 生命周期内管理监听。 |
| `AgentUIOutlet()` | 同 Provider 唯一表面目标。 |
| `host.on(event, listener)` | 返回取消订阅函数。 |

## 错误与结算

错误码包括 `AGENT_UI_NOT_READY`、`AGENT_UI_SESSION_ENDED`、`AGENT_UI_PROVIDER_MISSING` 和 `AGENT_UI_MULTIPLE_SURFACES`。ready 说明本地组合与 Runtime 已绑定，不证明后端健康。sendMessage Promise 和 run-end 可由取消、错误或中断结算，不作为成功标记。

用户资料不发送到 AG-UI 作为认证。连接变化和卸载需要清理待处理操作；运行结果从当前 snapshot 读取。可运行组合见[业务按钮教程](./react-host-control)。

> 截图待补：Provider/Outlet/按钮关系，以及初始化、ready、blocked 和 error 状态。
