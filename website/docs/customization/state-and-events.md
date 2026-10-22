---
title: 消费共享状态与应用事件
---

# 消费共享状态与应用事件

AG-UI state snapshot/delta、运行状态与应用事件先由 canonical Runtime 投影，Plugin 再通过提供的 context/bridge 消费。不在每个组件中另建 AG-UI 客户端。

## 读取与订阅

`useConversationRuntimeBridge<TState>()` 提供 agentRuntime、applicationEvents、observation 和 threadBinding。使用快照配合 subscribe，并在组件卸载时清理。Host 普通按钮可使用更窄的 `useAgentUIState`。

```tsx
import { useEffect } from 'react';
import { useConversationRuntimeBridge } from '@za38.03/agent-ui-runtime';

export function EventObserver({ onEvent }: {
  onEvent: (event: unknown) => void;
}) {
  const { applicationEvents } = useConversationRuntimeBridge();
  useEffect(() => applicationEvents.subscribe(onEvent), [applicationEvents, onEvent]);
  return null;
}
```

将观察组件放在已有 Provider 内。它只观察，不自行 start/stop 共享事件源，不在回调里无条件重复发请求。

## 状态规则

snapshot 是权威快照，delta 是基于既有状态的 patch，不把每个 delta 当完整替换。业务 state schema 在项目合同中校验；缺字段、未知事件和无效 payload 必须有可观察结果。

线程身份改变时保留数据归属。不要将旧线程的异步结果写入新线程，也不根据本地计时器把后端计划标记完成。

## 验证

覆盖初始空态、连续 delta、线程切换、取消、错误和卸载。订阅重复、状态对象不稳定可能导致渲染循环，先检查选择器和清理。

> 截图待补：同一共享状态驱动消息与侧区同步变化，以及切换线程后的隔离结果。

事件映射见[AG-UI 契约](../integration/ag-ui-contracts)。
