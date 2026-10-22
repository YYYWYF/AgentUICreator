---
title: 可选 Generative UI 接入
---

# 可选 Generative UI 接入

`@za38.03/agent-ui-plugins/generative-ui` 是独立可选出口，提供 JSON Generative UI 的组件词表与 action registry。它不表示所有预设默认支持任意动态 UI，也不等于完整 A2UI 协议支持。

## 创建受控 renderer

```ts
import { createAgentUIGenerativeUI } from '@za38.03/agent-ui-plugins/generative-ui';
import '@za38.03/agent-ui-plugins/generative-ui.css';
export const generativeUI = createAgentUIGenerativeUI();
```

helper 合并官方样式词表和显式传入的 components，可选 actions 使用同出口的 `createAgentUIGenerativeActions`。它返回 renderer 配置对象；接到消息中的方式应依当前公开类型和已有自定义 renderer 合同实现，不能把实例直接写入 AppUIModel。

## 定义产品边界

只开放审查过的组件与动作。字段、URL、布局规模和 action 参数先验证。动作执行需要独立的业务权限，收到 JSON 不能自动获得网络、存储或工具权限。

如果需要覆盖词表，先确认新增组件与当前 Host UI 栈兼容。生成展示仍使用当前 Runtime，不创建第二个连接。缺少可验证接入样例的可选能力应保持显式试用说明。

## 验证

准备最小合法数据、未知组件、非法参数、重复 action、取消和历史回放。确认历史渲染不会重新触发动作，缺组件能显示明确 Fallback。

> 截图待补：受控组件词表下的有效 UI、未知组件 Fallback 与 action 结果，标明可选功能。

参数类型见[可选入口](./testing-and-optional-entries)。
