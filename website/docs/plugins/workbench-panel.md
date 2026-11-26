---
title: 多内容侧栏
---

# 多内容侧栏

## 功能与效果

在同一工作台中打开和切换多个内容标签，关闭或收起时保留挂载。

### 多内容侧栏

<figure className="plugin-preview">

![多内容侧栏界面](/images/plugins/workbench-panel.png)

</figure>

## 修改与启用

### 内容标签 {#把插件加入多内容侧栏}

内容是普通 UI Plugin，先按[创建自定义插件](/development/create-plugin)创建并注册，例如 `my-content`。然后在项目的侧栏入口中接入它：

1. **声明内容插槽**：在 `plugins/workbench-panel/manifest.json` 的 `slots.children` 中增加 `contentA`：

   ```json
   "contentA": { "description": "Custom content", "cardinality": "one", "optional": true }
   ```

   侧栏的 `definition.ts` 改为用 `parseUIPluginManifest` 解析这份本地 manifest，保留原有其他字段，不再使用 npm 实现的 manifest。

2. **设置标签与内容**：在 `plugins/workbench-panel/index.tsx` 中，给原有官方组件传入 `items`，继续透传运行参数：

   ```tsx
   <Implementation {...props} items={[
     { id: 'content-a', label: labels.contentA, content: props.renderSlot?.('contentA') },
   ]} />
   ```

   `Implementation` 是原有的 `WorkbenchPanelPlugin` npm 导入，`labels.contentA` 从项目统一文案层读取。`items` 是完整标签列表，多项就继续添加。

3. **登记可打开的内容 ID**：在侧栏 `definition.ts` 的 `setup` 中，用匹配的 ID 创建服务，替换默认注册逻辑：

   ```ts
   setup({ services }) {
     return services.provide(
       WORKBENCH_PANEL_SERVICE,
       createWorkbenchPanelService(['content-a']),
     );
   },
   ```

   `WORKBENCH_PANEL_SERVICE`、`createWorkbenchPanelService` 从 `@za38.03/agent-ui-plugins/workbench-panel` 导入。保留 `provides: [WORKBENCH_PANEL_SERVICE]`，不要再调用默认 `setup` 重复提供服务。多项内容时列出全部 ID。

4. **放入内容插件**：在 `app-ui.json` 的侧栏实例 `slots` 中增加下面这一项，保留原有 `main` 等配置：

   ```json
   "contentA": [{ "pluginId": "my-content", "id": "my-content-main" }]
   ```

同步[项目插件注册表](/development/create-plugin#4-插件注册与验证)后完成接入。`contentA` 是插槽名，`content-a` 是对外打开使用的内容 ID，`my-content` 是插件 ID；按上面对应即可。

## 常见定制

<span id="常见需求"></span>

<span id="代码示例"></span>

### 打开侧栏内容 {#让其他插件打开指定内容}

<figure className="plugin-preview">

![生成报告和来源两个侧栏打开按钮](/images/plugins/features/workbench-panel-actions.png)

<figcaption>内容可以有各自的打开入口，例如“生成报告”和“来源”；点击后由同一个侧栏服务打开对应内容。</figcaption>
</figure>

调用方的 `definition.ts` 在原有 `inject` 中追加侧栏服务：

```ts fold height=180
inject: ['agent-ui.workbench-panel'],
```

#### 从自己的按钮或卡片打开 {#从结果卡片打开侧栏}

调用方组件取得服务，点击时调用 `open(内容ID)`：

```tsx fold height=180
import {
  WORKBENCH_PANEL_SERVICE, usePluginService, type WorkbenchPanelService,
} from '@za38.03/agent-ui-plugins';

export function OpenContent({ label }: { label: string }) {
  const panel = usePluginService<WorkbenchPanelService>(WORKBENCH_PANEL_SERVICE);
  return <button type="button" disabled={!panel}
    onClick={() => panel?.open('content-a')}>{label}</button>;
}
```

`label` 从项目统一文案层传入。调用方可以在侧栏外的工具栏、消息卡片等位置，只要与侧栏处于同一个 Agent 服务作用域。不需要再给内容插件注册单独的打开方法，也不需要动态修改 `app-ui.json`。

<span id="服务方法与状态"></span>

内容 ID 必须与服务及 `items` 一致。状态只保留在当前页面生命周期内，刷新后重置；按会话保存或持久化数据由内容插件处理。通用依赖与订阅规则见[自定义服务](/development/plugin-api#自定义服务)。

#### 显示一组打开按钮 {#为两个内容显示打开按钮}

需要现成的按钮列表时，在已有调用方的应用层使用 `WorkbenchPanelActionsPlugin`，同样声明上述服务依赖：

```tsx fold height=180
import { WorkbenchPanelActionsPlugin } from '@za38.03/agent-ui-plugins/workbench-panel-actions';

export function PanelButtons({ labels }: { labels: { report: string; sources: string } }) {
  return <WorkbenchPanelActionsPlugin items={[
    { id: 'report', label: labels.report },
    { id: 'sources', label: labels.sources },
  ]} />;
}
```

先在侧栏的 `items` 和服务中登记 `report`、`sources`，`labels` 从项目统一文案层传入。组件复用当前 Agent 的侧栏服务，点击后打开对应内容。`items={[]}` 隐藏所有按钮，已打开的内容保持原状；缺少服务时按钮禁用。

`WorkbenchPanelActionsPlugin` 也可通过 `workbench-panel-actions` 插件应用入口配置，默认不启用。需要显式传入服务时，使用根入口导出的 `WorkbenchPanelActions`，其属性为 `service?: WorkbenchPanelService`、`items?: readonly { id: string; label: string }[]`；两种组件均默认不显示按钮，不透传原生 `nav` 或按钮属性。

### 设置侧栏宽度 {#设置侧栏宽度}

<span id="example-1"></span>


panelWidth 单位为像素。主区域较窄时，面板仍不会超过整个容器宽度的 45%。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { WorkbenchPanel } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof WorkbenchPanel>) {
  return <WorkbenchPanel {...props}
    panelWidth={420} />;
}
```

<span id="example-2"></span>

### 受控展开状态 {#受控展开状态}

open 由项目管理，onOpenChange 同步用户收起/展开操作；已有 service 和 items 继续传入。

```tsx fold height=180
import { useState, type ComponentProps } from 'react';
import { WorkbenchPanel } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof WorkbenchPanel>) {
  const [open, setOpen] = useState(false);
  return <WorkbenchPanel {...props}
    open={open}
    onOpenChange={setOpen} />;
}
```

### 侧栏状态联动 {#hook}

业务工具栏需要高亮当前内容时，声明 `agent-ui.workbench-panel` 依赖，用 `usePluginService()` 取得同一 Agent 的服务，再用 `usePluginService()` 订阅：

```tsx fold height=180
import { WORKBENCH_PANEL_SERVICE, usePluginService, type WorkbenchPanelService, type WorkbenchPanelSnapshot } from '@za38.03/agent-ui-plugins';

const fallback: WorkbenchPanelSnapshot = {
  open: false, activeItemId: '', visibleItemIds: [],
};

export function ReportTab({ label }: { label: string }) {
  const panel = usePluginService<WorkbenchPanelService>(WORKBENCH_PANEL_SERVICE);
  const selected = usePluginService(panel, snapshot => snapshot.open && snapshot.activeItemId === 'report', fallback);
  return <button type="button" disabled={!panel}
    aria-pressed={selected}
    onClick={() => panel?.open('report')}>{label}</button>;
}
```

先在原侧栏 `items` 和服务中登记 `report`，`label` 从项目文案传入。点击打开报告；其他入口切换标签或收起侧栏时，按钮的选中状态也随之更新。缺少服务时禁用按钮，fallback 不会创建新侧栏。

## 属性与 API

<span id="属性"></span>

<span id="开发-api"></span>

### API



`WorkbenchPanel` / `WorkbenchPanelPlugin` 的属性类型均为 `WorkbenchPanelProps`，不继承全部 `div` 属性。

| 属性 | 类型 | 默认行为 |
| --- | --- | --- |
| `service?` | `WorkbenchPanelService` | 原始展示组件显式接收；插件组件默认从当前服务作用域取得 |
| `renderMain?` | `() => ReactNode` | 主内容的备用渲染入口；已有 main 插槽优先 |
| `items?` | `readonly WorkbenchPanelItem[]` | 默认空数组，不内置内容 |
| `mainActions?` | `ReactNode` | 主操作区备用节点；已有 `mainActions` 插槽优先 |
| `open?` | `boolean` | 受控展开状态，否则读取服务；没有服务时默认收起 |
| `activeItemId?` | `string` | 受控选中项，否则读取服务与可见项 |
| `visibleItemIds?` | `readonly string[]` | 受控可见标签；否则读取服务，未传服务时从 items 和本地关闭记录推导 |
| `onOpenChange?` | `(open: boolean) => void` | 展开／收起变化通知 |
| `onActiveItemChange?` | `(id: string) => void` | 当前内容变化通知 |
| `onVisibleItemsChange?` | `(ids: readonly string[]) => void` | 标签打开／关闭变化通知 |
| `panelWidth?` | `number` | 默认 `360` 像素，展示时不超过容器的 45% |
| `className?` / `style?` | `string` / `CSSProperties` | 整体容器样式 |
| `renderSlot?` / `renderScopedSlot?` | `Partial<UIPluginComponentProps>` 对应成员 | Runtime 组合入口；保留已有转发，本组件使用普通插槽 |

`WorkbenchPanelItem` 的字段为：

- 必需：`id: string`、`label: string`、`content: ReactNode`。
- 可选：`icon?: ReactNode`。

`id` 与服务登记一致，`label` 使用项目统一文案。关闭或收起只隐藏内容，所有 items 的内容继续挂载。

原始展示组件没有服务时，需要通过 `open` / `onOpenChange` 控制展开；单独传入 items 不会创建展开状态服务。既有插件组件已经取得面板服务，普通项目继续保留该绑定。

<span id="取数与联动"></span>

其他插件既能打开、切换或关闭内容，也能订阅当前展开状态、选中项和可见标签。要实现“选中工单／文件后打开详情”，先更新共享业务服务，再调用 `open(内容ID)`；内容插件订阅同一服务取数，见[联动示例](/development/plugin-interaction#插件之间共享选择或结果)。

#### 服务方法 {#服务}

提供 `agent-ui.workbench-panel`，类型为 `WorkbenchPanelService`：

- 状态接口：继承 `getSnapshot()` / `subscribe(listener)`。
- 操作接口：`open(id?)`、`activate(id)`、`close(id)`、`collapse()`，均返回 `void`。

`WorkbenchPanelSnapshot` 的字段为：

| 字段 | 类型 |
| --- | --- |
| `open` | `boolean` |
| `activeItemId` | `string` |
| `visibleItemIds` | `readonly string[]` |

`createWorkbenchPanelService(itemIds = DEFAULT_WORKBENCH_PANEL_IDS)` 创建服务，默认 ID 数组为空。空白／重复 ID 或操作未知 ID 会报错。

- 根入口或 `/workbench-panel`：导入 `WORKBENCH_PANEL_SERVICE`、工厂、服务与快照类型。
- 根入口：导入 `DEFAULT_WORKBENCH_PANEL_IDS`。

服务按 Agent 作用域创建，业务插件复用现有实例。

#### 侧栏操作

| 方法 | 行为 |
| --- | --- |
| `open(id)` | 展开并选中内容；已关闭的标签也可重新打开。 |
| `open()` | 恢复上次内容。 |
| `close(id)` | 关闭标签。 |
| `collapse()` | 收起侧栏。 |
| `activate(id)` | 只切换选中项，保持当前展开状态。 |
| `getSnapshot()` / `subscribe()` | 读取和订阅状态。 |

## 常见问题

### 设置 open=true 为什么仍然没有内容？ {#设置-opentrue-为什么仍然没有内容}

需要有效的 items 和可见的选中内容。默认工作台没有内置内容；按本页接入步骤登记项目内容，再展开。
