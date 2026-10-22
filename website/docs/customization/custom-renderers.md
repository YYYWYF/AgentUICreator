---
title: 自定义工具、数据消息与结构化结果
---

# 自定义工具、数据消息与结构化结果

先识别数据入口：工具结果用命名 toolkit 注册，数据消息用 `defineDataMessageUI`，普通布局组件用语义 Slot。它们不能互相替代。

## 命名注册

```tsx
import { CanonicalChartMessage, defineDataMessageUI } from '@za38.03/agent-ui-plugins';
export const chartMessageUI = defineDataMessageUI<unknown>({
  name: 'chart', render: CanonicalChartMessage,
});
```

这是官方 chart 的现有注册片段。definition 还需保留 `dataMessageUIs` 并让 `Component` 返回 null；chart 样式使用现有应用层 CSS。不要删除注册，仅保留一个空组件。

## renderer props

沿用公开类型，保留工具调用身份、参数、结果、运行状态与 scope。覆盖 `renderStatus` 等 seam 时保留无效数据和错误 Fallback，不通过显示文案决定工具结果成功与否。

搜索和检索保留 DOM/count/cycle 参数以及 `searchTools` 文案命名空间。状态、文件、图表等渲染器校验各自 payload，不把任意 JSON 自动解释成受信任内容。

## 安全和生命周期

URL、文件地址和文本视为数据，业务控制可访问来源。工具 renderer 只展示，不在 mount 触发执行。历史加载、分支切换和 StrictMode 都不能重复业务副作用。

在需要时使用 compound parts 组合通用工具 UI，但保留审批、interrupt、允许/拒绝与错误交互。不要通过替换 Fallback 丢掉当前用户必须回答的操作。

> 截图待补：合法 payload、缺字段、无效 payload、工具失败和历史重放的展示对照。

参见[数据契约](../integration/ag-ui-contracts)与[Plugin 专页](../plugins/)。
