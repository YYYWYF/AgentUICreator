---
title: "自定义结果展示"
---

# 自定义结果展示

已有消息或工具结果需要不同的视觉结构时，在对应插件的项目入口中使用组件公开的渲染函数。保留原有消息名称、工具名称、运行状态，以及传给展示组件的当前消息或工具调用数据。

从自定义 AG-UI 事件开始接入新消息卡片时，见[自定义 AG-UI 事件与消息渲染](./custom-ag-ui-events)，其中包含事件格式、解析函数、插件注册与启用的完整示例。

## 示例：调整图表数值

打开 `plugins/chart-message/index.tsx`，保留样式导入和 `chart` 注册名称，为已有渲染函数增加格式化：

```tsx
import './style.css';
import { CanonicalChartMessage, defineDataMessageUI } from '@za38.03/agent-ui-plugins';

export const chartMessageUI = defineDataMessageUI<unknown>({
  name: 'chart',
  render: props => (
    <CanonicalChartMessage
      {...props}
      formatValue={value => new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
      }).format(value)}
      styles={{ bar: { borderRadius: 4 } }}
    />
  ),
});
```

数值格式使用浏览器语言；需要随应用语言变化时，读取项目统一 locale 后选择对应格式。

| 属性 | 类型 | 用途 |
| --- | --- | --- |
| `formatValue` | `(value, item) => ReactNode` | 改变数值显示 |
| `renderItem` | `(item, index, data) => ReactNode` | 替换一个数据项的内容 |
| `renderChart` | `(data) => ReactNode` | 替换整个有效图表的展示 |
| `className`、`style`、`title` | React 常用属性与标题 | 设置整体样式与显示标题 |
| `classNames`、`styles` | 按 caption、list、item、label、track、bar、value 分区的映射 | 设置语义区域样式 |

类型 `ChartMessageProps` 从同一公开入口导入。只改格式或样式时，可以保留默认布局；需要新结构时使用 `renderItem` 或 `renderChart`。

## 工具结果与其他消息

工具卡片先使用对应组件的 `className`、`style`、展开状态、内容属性和公开组合接口，具体见[工具调用详情](/plugins/tool-fallback)。增加专用工具展示时，沿用项目已有 toolkit 注册方式，保留工具调用参数、运行状态、结果和审批处理；展示组件不执行后端工具。

图表、计划和文件等消息插件可能通过 `dataMessageUIs` 或 `toolkit` 注册，`Component` 返回 null。保留注册字段和路由名称，仅修改渲染函数。把它们改成普通布局组件会丢失消息展示入口。

检查有数据、空数据、失败、流式更新和历史回放。打开历史记录时不能再次触发业务操作。只想向 Creator 描述目标效果，见[工具与结果展示需求](/guide/adjustments/custom-renderers)。
