# 创建自定义插件

已有插件的属性和组合无法满足需求时，可以在项目中编写新的 React 插件。先到[插件](/plugins/index.md)检查可复用能力；只需让 Creator 帮你新增功能时，见[增加新的界面功能](/guide/add-function.md)。

以下路径相对于生成目录，默认为 `src/agent-ui/`。

开发时可以直接复用会话操作、状态 Hook、服务、事件、子插槽和消息展示接口。先查[公共能力速查](/development/plugin-api.md#公共能力速查)，各项提供使用前提和代码示例；插件组件和业务页面的接口入口也在其中区分。

## 1. 声明插件

新建 `plugins/ticket-actions/manifest.json`：

```json
{
  "id": "ticket-actions",
  "name": "Ticket actions",
  "description": "Project ticket actions",
  "version": "0.0.1",
  "capabilities": ["ticket-action"]
}
```

选择项目自己的 ID，不与已有官方插件重名。这里的能力名称用于匹配插槽，声明文字用于工程识别；实际按钮和提示使用项目文案层。

## 2. 编写组件

新建 `plugins/ticket-actions/index.tsx`。先用一个不含业务文案的空容器确认注册，之后在此组件中接入已有业务组件：

```tsx
export function TicketActions() {
  return <div data-ui-plugin="ticket-actions" />;
}
```

沿用工程安装的 UI 库和版本。需要按钮文字时，在项目文案类型和中英文文件中增加对应业务命名空间，按[样式与文案开发](/development/styling-and-localization.md)读取。需要数据时复用项目服务或现有运行状态，接口见[插件开发接口](/development/plugin-api.md)。

新建 `plugins/ticket-actions/definition.ts`：

```ts
import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { TicketActions } from './index';
import manifest from './manifest.json';

export const ticketActionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  Component: TicketActions,
};

export default ticketActionsPlugin;
```

## 3. 放入布局或已有子插槽

在 `app-ui.json` 的已有布局中新增一个插件实例。例如，在一个允许普通内容的布局插槽的 `plugins` 数组中添加：

```json
{ "pluginId": "ticket-actions", "id": "ticket-actions-main" }
```

这是数组元素，不能用来覆盖整个文件。已有实例 ID 保持不变；也可以放入接受 `ticket-action` 能力的父插件子插槽。布局示例见[布局与插件组合](/development/layout-and-composition.md)。

## 4. 更新注册并检查

新增目录后，需要重新生成插件注册表。可以让 Creator 执行注册与检查，或在项目根目录保存开发脚本 `scripts/sync-agent-ui.mjs`：

```js
import { synchronizeAgentUIPluginRegistry } from '@za38.03/agent-ui-creator/project/dev';

const result = await synchronizeAgentUIPluginRegistry(process.cwd());
console.log(result);
```

在项目根目录运行：

```sh
node scripts/sync-agent-ui.mjs
```

此命令属于开发工具，会更新生成的注册表并初始化缺少的官方项目入口；已有入口会保留。提交前检查实际文件差异。不要把这个开发脚本导入生产组件，也不要手工编辑 `registry.generated.ts`。

运行项目已有的类型检查、测试和构建，然后在页面确认新功能出现、停用可隐藏、恢复后可用。空容器不会产生可见内容；接入业务组件后再验证真实交互。
