---
title: 从业务页面控制 Agent
---

# 从业务页面控制 Agent

业务按钮通过公开 Host API 向同一个会话发送、停止或新建对话，不为每个按钮创建 Runtime。把 `Agent` 和按钮放入同一个 `AgentUIProvider`：

```tsx
import { Agent, AgentUIProvider, useAgentUI, useAgentUIState } from './agent-ui';

function SendButton({ label, prompt, onError }: {
  label: string; prompt: string; onError: (error: unknown) => void;
}) {
  const host = useAgentUI();
  const ready = useAgentUIState(s => s.status === 'ready');
  return <button disabled={!ready}
    onClick={() => { void host.sendMessage(prompt).catch(onError); }}>
    {label}
  </button>;
}
export function Workspace({ label, prompt, onError }: {
  label: string; prompt: string; onError: (error: unknown) => void;
}) {
  return <AgentUIProvider endpoint="/api/agent">
    <SendButton label={label} prompt={prompt} onError={onError} />
    <Agent />
  </AgentUIProvider>;
}
```

展示文字由业务 locale 提供。`getSnapshot()` 返回 Host 状态和 Runtime 快照，只有 ready 后才能操作。`useAgentUIState` 选择稳定字段或引用，不在选择器中每次分配新对象。

此处使用生成项目导出的 `AgentUIProvider`，连接地址和其他配置传给外层 Provider。可用参数见[Agent 参数与配置](./agent-options)。

## 运行语义

`sendMessage()` Promise 结算与 `run-end` 都不表示回答成功。检查运行状态，分别处理错误、取消和等待输入。卸载或连接身份变化时，未完成操作可能以会话结束错误结算。

使用 `abortRun()`、`startNewConversation()` 和 `resumeInterrupts()` 保留对应语义。订阅 `useAgentUIEvent` 或 `host.on`，手动订阅要调用返回的清理函数。

## 挂载与身份

需要把表面放在指定位置时，在同一个 Provider 内使用 `AgentUIOutlet`；一个 Provider 只允许一个目标。Provider 的 `user` 仅是展示资料，不是认证凭据。

> 截图待补：业务按钮向已存在的同一会话发送消息，展示 ready 前禁用和错误反馈。

错误码与精确签名见[Host API](./react-host-api)。
