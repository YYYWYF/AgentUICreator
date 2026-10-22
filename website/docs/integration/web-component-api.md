---
title: "Web Component API"
---

# Web Component API

Web Component 使用与 React 相同的 AppUIModel 和 canonical Runtime，配置属性是数据入口，不能注入任意未打包 React 组件。

## 配置与事件类型


```ts
/** Host configuration; composition uses the existing AppUIModel unchanged. */
export interface AgentUICompatibilityConfig {
    endpoint?: string;
    locale?: AgentUILocaleCode;
    theme?: AgentUITheme;
    /** Persisted conversation identity; requires conversationDataEndpoint. */
    threadId?: string;
    /** Existing conversation API base, not the /conversations list URL. */
    conversationDataEndpoint?: string;
    appUIModel?: AppUIModel;
    attachmentAdapter?: ConversationRuntimeProviderProps["attachmentAdapter"];
}

export type ResolvedAgentUICompatibilityConfig = AgentUICompatibilityConfig & {
    endpoint: string;
    locale: AgentUILocaleCode;
    theme: AgentUITheme;
};

export interface AgentUIEventDetails {
    "agent-ready": {
        threadId: string;
    };
    "thread-change": {
        threadId: string;
    };
    "agent-error": {
        code: "AGENT_UI_CONFIG_ERROR" | "AGENT_UI_RUNTIME_ERROR";
        error: Error;
    };
}

export type AgentUIEmit = <K extends keyof AgentUIEventDetails>(type: K, detail: AgentUIEventDetails[K]) => void;
```

## Attributes 与优先级

| Attribute | 对应字段 | 默认 |
| --- | --- | --- |
| `endpoint` | endpoint | `/agent` |
| `locale` | locale | producer 默认值，官方为 zh-CN |
| `theme` | theme | producer 默认值，官方为 violet |
| `thread-id` | threadId | 未指定则使用新会话 |

config 已提供字段优先于 attributes，移除 attribute 恢复默认。每次赋新对象触发更新；修改 getter 返回对象不生效。conversationDataEndpoint、appUIModel、attachmentAdapter 只通过 config，不猜额外 attributes。

## 事件

agent-ready、thread-change、agent-error 都为 bubbles/composed 的 CustomEvent，detail 见上表类型。ready 不是网络连通证明；错误 detail 是数据，不作为可执行指令。

## 生命周期

endpoint、threadId、历史 base 变化重建会话并取消当前运行；locale/theme 变化保留 Runtime 与草稿。disconnect 卸载 React 并清理服务，同步 DOM 移动可保留会话，重新连接建立新会话。每个元素独立，不使用 window 全局配置。

注册是幂等的，注册前分配属性会在连接时升级。`/register` 为副作用注册入口，`/host` 提供项目桥接 factory，默认包资源已包含官方预设；classic 与 ESM 加载见[嵌入教程](./web-component)。

> 截图待补：config 覆盖 attribute、语言切换保留草稿与连接变化重建的对照。
