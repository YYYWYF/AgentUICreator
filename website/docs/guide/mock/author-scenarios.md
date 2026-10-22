---
title: 编写自己的 Mock 场景
---

# 编写自己的 Mock 场景

场景 API 从 Creator 的 `/mock-agent` 出口导入，只用于开发。先用最小场景检查连接，再逐步加入工具、状态和中断。

```ts
import { defineScenario, createMockAgentVitePlugin } from '@za38.03/agent-ui-creator/mock-agent';
const scenario = defineScenario({
  id: 'project-greeting', title: 'Project greeting',
  steps: [{ type: 'message', text: 'A deterministic project response.' }],
});
export const mockPlugin = createMockAgentVitePlugin({
  endpoint: '/agent', scenarios: [scenario], defaultScenarioId: scenario.id,
});
```

标题和文本是演示数据；若出现在正式产品默认界面，应使用其域 locale。Vite 之外可用 `createScenarioRegistry`、`createMockAgentHttpHandler` 接到开发 Node HTTP server。

## 场景组成

`MockScenario` 支持初始 state、步骤、资源要求、参考类别和恢复分支。步骤可表达推理、工具、并行工具、state delta、activity snapshot/delta 和文本等，以当前公开 `MockScenarioStep` 为准。

使用 `resources` 标记所需 UI 能力；reference 说明是前端呈现还是后端协议参考。工具结果必须与 UI 合同一致，不把自创结构当成公开协议。

## 执行语义

前端工具步骤只输出标准调用，浏览器 execute 产生结果并继续；不要同时伪造后端结果和浏览器结果。审批的允许、拒绝、取消分别设置恢复分支。持久恢复演示需要共用 durable store。

## 验证与交付

运行场景 schema 校验，检查事件顺序、取消和重复发送。禁止把 Mock server、场景注册表或真实录制私密数据导入生产入口。

> 截图待补：自定义场景列表、一次完整运行及取消/错误分支，注明预设数据。
