# 多内容侧栏

`workbench-panel` 提供右侧多标签面板，其他插件通过 `open(内容ID)` 打开指定内容。切换、关闭标签和收起时保留内容组件挂载，不中断正在进行的对话。当前仅支持工作台。

![用户配置内容后的多内容侧栏：顶部可切换标签、关闭内容或收起面板](/images/plugins/workbench-panel.png)

以下路径相对于生成目录，默认为 `src/agent-ui/`。新工作台已有侧栏容器，默认不配置内容、标签或打开按钮；用户接入自己的内容后使用。

## 把插件加入多内容侧栏

内容是普通 UI Plugin，先按[创建自定义插件](/development/create-plugin.md)创建并注册，例如 `my-content`。然后在项目的侧栏入口中接入它：

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

同步[项目插件注册表](/development/create-plugin.md#4-插件注册与验证)后完成接入。`contentA` 是插槽名，`content-a` 是对外打开使用的内容 ID，`my-content` 是插件 ID；按上面对应即可。

## 让其他插件打开指定内容

调用方的 `definition.ts` 在原有 `inject` 中追加侧栏服务：

```ts
inject: ['agent-ui.workbench-panel'],
```

调用方组件顶层取得服务，点击按钮或链接时调用 `open`：

```tsx
import { usePluginService } from '@za38.03/agent-ui-plugins';
import type { WorkbenchPanelService } from '@za38.03/agent-ui-plugins/workbench-panel';

// 放在已有组件函数顶层。
const panel = usePluginService<WorkbenchPanelService>('agent-ui.workbench-panel');
// 放在按钮或链接的点击处理函数中。
panel?.open('content-a');
```

调用方可以在侧栏外的工具栏、消息卡片等位置，只要与侧栏处于同一个 Agent 服务作用域。不需要再给内容插件注册单独的打开方法，也不需要动态修改 `app-ui.json`。

### 服务方法与状态

`open(id)` 展开并选中内容，已关闭的标签也可重新打开；`open()` 恢复上次内容，`close(id)` 关闭标签，`collapse()` 收起侧栏，`activate(id)` 只切换选中项并保持展开状态。`getSnapshot()` / `subscribe()` 用于读取和订阅状态。

内容 ID 必须与服务及 `items` 一致。状态只保留在当前页面生命周期内，刷新后重置；按会话保存或持久化数据由内容插件处理。通用依赖与订阅规则见[自定义服务](/development/plugin-api.md#自定义服务)。
