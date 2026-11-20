---
title: "侧栏打开按钮（workbench-panel-actions）"
---

# 侧栏打开按钮（workbench-panel-actions）

为已登记的侧栏内容显示打开按钮，复用同一个面板服务。

<span id="常见需求"></span>
<span id="代码示例"></span>

## 侧栏打开入口

<figure className="plugin-preview">

<img src="/images/plugins/features/workbench-panel-actions.png" alt="侧栏打开入口界面" width="672" height="98" />

<figcaption>当前公开组件的本地演示，使用 Mock 数据。</figcaption>
</figure>

## 内容按钮 {#为两个内容显示打开按钮}

<span id="example-1"></span>


入口标签由项目共享双语文案提供；report 和 sources 必须已在 workbench-panel 的服务与内容列表中登记。

```tsx
import { WorkbenchPanelActionsPlugin } from '@za38.03/agent-ui-plugins/workbench-panel-actions';
import { useLocaleCode } from '@za38.03/agent-ui-plugins';

const messages = {
  'zh-CN': { report: '报告', sources: '来源' },
  'en-US': { report: 'Report', sources: 'Sources' },
};
export function Example() {
  const labels = messages[useLocaleCode()];
  return <WorkbenchPanelActionsPlugin items={[
    { id: 'report', label: labels.report }, { id: 'sources', label: labels.sources },
  ]} />;
}
```

<span id="example-2"></span>

## 隐藏打开入口 {#隐藏所有打开按钮}

空数组表示没有任何按钮，不会自动关闭已经打开的侧栏内容。

```tsx
import type { ComponentProps } from 'react';
import { WorkbenchPanelActions } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof WorkbenchPanelActions>) {
  return <WorkbenchPanelActions {...props}
    items={[]} />;
}
```

## 按内容配置打开入口 {#给业务内容增加打开入口}

组件与服务位于同一 Agent，并声明 `agent-ui.workbench-panel` 依赖。

```tsx
import {
  WorkbenchPanelActions, WORKBENCH_PANEL_SERVICE, usePluginService,
  type WorkbenchPanelService,
} from '@za38.03/agent-ui-plugins';

export function ReportActions({ label }: { label: string }) {
  const service = usePluginService<WorkbenchPanelService>(WORKBENCH_PANEL_SERVICE);
  return <WorkbenchPanelActions service={service} items={[{ id: 'report', label }]} />;
}
```

## API

<span id="属性"></span>
<span id="开发-api"></span>

`WorkbenchPanelActions` / `WorkbenchPanelActionsPlugin` 使用 `WorkbenchPanelActionsProps`，不继承原生 `nav` 或按钮属性。

| 属性 | 类型 | 默认行为 |
| --- | --- | --- |
| `service?` | `WorkbenchPanelService` | 原始组件显式接收；插件组件从当前作用域取得 |
| `items?` | `readonly { id: string; label: string }[]` | 默认空数组，不显示任何按钮 |
| `renderSlot?` / `renderScopedSlot?` | `Partial<UIPluginComponentProps>` 对应成员 | 类型保留的运行环境参数，当前展示不调用它们 |

没有 service 时按钮禁用；点击调用 `service.open(item.id)`。`label` 由项目统一文案提供；`id` 必须已在面板服务和内容列表登记。例如 `items={[{ id: 'report', label }]}` 为已登记的报告增加入口，`label` 使用当前语言的文字。

<span id="hook"></span>

要让业务入口随侧栏当前标签更新，取得已有面板服务，再订阅它的 `getSnapshot()` / `subscribe()`。完整示例见[侧栏状态联动](./workbench-panel#hook)；只需打开某项内容时，使用[按内容配置打开入口](#给业务内容增加打开入口)的 `ReportActions`，不需要自己维护展开状态。

### 服务方法 {#服务}

依赖 `agent-ui.workbench-panel`，通过同一 `WorkbenchPanelService.open(item.id)` 打开内容，不另建状态。服务契约见 [多内容侧栏](./workbench-panel#服务)。
