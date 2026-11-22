---
title: "创建自定义插件"
---

# 创建自定义插件

已有插件的属性和组合无法满足需求时，可以在项目中编写新的 React 插件。先到[插件](/plugins/)检查可复用能力；只需让 Creator 帮你新增功能时，见[增加新的界面功能](/guide/add-function)。

以下路径相对于生成目录，默认为 `src/agent-ui/`。

**先完成第 1～4 步，让新插件显示出来。需要跨插件调用时，再阅读可选示例。**

| 你要完成什么 | 阅读路径 |
| --- | --- |
| 新增一个能显示和交互的插件 | 从[声明插件](#1-声明插件)开始，依次完成组件、布局和注册 |
| 让另一个插件调用它的方法或共享状态 | 完成基础注册后，展开[服务示例](#5-向其他插件提供方法) |

**先认清插件接入涉及的文件：**

| 文件 | 负责什么 | 怎样维护 |
| --- | --- | --- |
| `plugins/ticket-actions/manifest.json` | 声明插件 ID、版本、能力和可开放的子插槽。 | 自己编写；本例 ID 为 `ticket-actions`。 |
| `plugins/ticket-actions/index.tsx` | 实现实际显示的 React 组件和交互。 | 自己编写。 |
| `plugins/ticket-actions/definition.ts` | 将 manifest 与组件绑定，也可声明服务和消息渲染器。 | 自己编写，并默认导出插件定义。 |
| `app-ui.json` | 选择使用这个插件的实例，配置位置、启停和父子组合。 | 在已有布局中追加实例。 |
| `plugins/registry.generated.ts` | 保存由工具生成的插件目录和 definition 加载入口，供应用使用。 | 执行同步命令生成，不手工编辑。 |

接入顺序是：**声明插件 → 编写组件并在 definition 中绑定 → 在 JSON 中放入实例 → 同步注册表**。下面用一个工单插件走完这个过程。

## 1. 声明插件 {#1-声明插件}

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

## 2. 编写组件 {#2-编写组件}

先新建 `application/i18n/messages.ts`，提供本例的双语文案。已有这个文件时，合并 `ticketActions` 领域并保留原来的读取函数：

```ts
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const zhCN = {
  ticketActions: {
    ready: '工单插件已接入',
    open: '打开示例工单',
    clear: '清除选择',
  },
};
const enUS: typeof zhCN = {
  ticketActions: {
    ready: 'Ticket plugin is ready',
    open: 'Open sample ticket',
    clear: 'Clear selection',
  },
};
const messages: Record<AgentUILocaleCode, typeof zhCN> = { 'zh-CN': zhCN, 'en-US': enUS };
export function getProjectMessages(locale: AgentUILocaleCode) { return messages[locale]; }
```

新建 `plugins/ticket-actions/index.tsx`，先显示一行文字，便于确认注册和布局生效：

```tsx
import { useLocaleCode } from '@za38.03/agent-ui-plugins';
import { getProjectMessages } from '../../application/i18n/messages';

export function TicketActions() {
  const labels = getProjectMessages(useLocaleCode()).ticketActions;
  return <p data-ui-plugin="ticket-actions"
    style={{ margin: 0, padding: 12, background: 'var(--background)', color: 'var(--foreground)' }}>
    {labels.ready}
  </p>;
}
```

沿用工程安装的 UI 库和版本。需要按钮文字时，在项目文案类型和中英文文件中增加对应业务命名空间，按[语言与文案](./localization#新增业务文案)读取。需要数据时复用项目服务或现有运行状态，接口见[插件 API](./plugin-api)。

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

`Component: TicketActions` 将组件接入插件，`export default` 供生成的注册表加载。组件文件本身不会自动完成注册。

## 3. 布局与子插槽配置 {#3-布局与子插槽配置}

打开 `app-ui.json`，在 `root` 中找到准备显示工单内容的 `type: "slot"` 节点，在它的 `plugins` 数组中追加本例插件。下面展示追加后的局部结构；已有数组中还有其他插件时一并保留：

```json
{
  "type": "slot",
  "plugins": [
    { "pluginId": "ticket-actions", "id": "ticket-actions-main" }
  ]
}
```

`pluginId` 对应 `manifest.json` 中的 `id`，`id` 是这一次使用的实例身份；已有实例 ID 保持不变。省略 `enabled` 时默认启用。如果需要新建一个显示区域，把完整的 `slot` 节点加入合适的 `row.children` 或 `column.children`，具体见[容器说明与完整 JSON 示例](./layout-and-composition#布局节点入门)。这个局部片段不能覆盖整个文件。

本例是普通页面内容，也可以放入接受 `ticket-action` 能力的父插件子插槽。应用级服务或消息渲染插件则按其合同配置到 `applicationPlugins`；它们不需要单独占据一个页面区域。

## 4. 插件注册与验证 {#4-插件注册与验证}

完成文件和实例配置后，需要同步注册表。**以下两种方式任选一种**，都会按当前插件定义和 `app-ui.json` 更新 `plugins/registry.generated.ts`。

**通过 Creator 同步**

在连接了目标工程的 Creator 输入框中输入 `/sync` 并发送，或从快捷命令菜单选择它。它负责更新注册表；前面的组件和实例配置仍需先完成。命令入口见[Creator 快捷命令](/guide/commands)。

**手动执行同步脚本**

手动脚本需要开发环境能够解析 `@za38.03/agent-ui-creator` 包。在目标项目根目录保存 `scripts/sync-agent-ui.mjs`（这个脚本位于项目根目录下，不在 `src/agent-ui/` 中）：

```js
import { synchronizeAgentUIPluginRegistry } from '@za38.03/agent-ui-creator/project/dev';

const result = await synchronizeAgentUIPluginRegistry(process.cwd());
console.log(result);
```

在项目根目录运行：

```sh
node scripts/sync-agent-ui.mjs
```

`process.cwd()` 是同步操作的目标项目根目录，因此要在目标项目根目录执行命令。脚本使用 Node.js，不需要 Bash 或平台专用命令，可在 Windows、macOS 和 Linux 的终端中使用。

同步会读取插件声明，并为 `app-ui.json` 引用的插件生成 definition 加载入口；只新增插件目录，还需要完成第 3 步的实例配置。它也会初始化缺少的官方项目入口，已有入口会保留。默认生成目录下的结果是 `src/agent-ui/plugins/registry.generated.ts`，可查看差异确认新插件已被收录。

新增插件、修改 manifest 或 definition 声明，以及增删组合中的插件后，重新执行同步。无需手写生成文件中的 import 或插件列表。同步脚本属于开发工具，不要导入生产组件；最终前端继续独立构建和部署。

运行项目已有的类型检查、测试和构建。页面应显示“工单插件已接入”，切到英文后显示“Ticket plugin is ready”；将实例设为 `enabled: false` 后文字消失，恢复后重新出现。确认这些步骤后，再用自己的业务组件替换这行文字，并验证真实交互。

如果没有显示，先检查 `manifest.json` 的 ID 与 JSON 的 `pluginId` 是否一致、`definition.ts` 是否默认导出，以及实例是否已放进当前显示的布局分支并启用；修正后再次同步并检查页面。同步时报出的插槽或服务依赖错误，应按实际提示处理。

## 可选：向其他插件提供方法 {#5-向其他插件提供方法}

例如，工单插件提供 `select(id)` 和 `clear()`，另一个插件点击按钮调用它们。跨插件的公开方法通过 **Service** 注册：提供方声明 `provides`，在 `setup` 中注册实现；调用方声明 `inject`，在组件中取得服务后调用。

服务名和方法名由项目定义，不需要在 manifest 中新增 `actions` 字段。`usePluginActions()` 提供的是发送消息、停止运行等已有会话操作，不会自动收录自定义方法。组件之间的本地调用也不走 AG-UI 业务事件。

<details class="dev-guide-details">
<summary>展开完整示例：定义、注册、订阅并调用工单选择服务</summary>

<span id="定义接口与实现"></span>

**定义接口与实现**

新建 `services/ticket-selection.ts`。接口放在项目服务目录，让调用方依赖这个接口，而不是导入提供方的组件或内部实现：

```ts
import type { UIPluginObservableService } from '@za38.03/agent-ui-plugins/contracts';

export const TICKET_SELECTION_SERVICE = 'project.ticket-selection';

export interface TicketSelectionSnapshot {
  selectedId: string | null;
}

export interface TicketSelectionService
  extends UIPluginObservableService<TicketSelectionSnapshot> {
  select(id: string): void;
  clear(): void;
}

export function createTicketSelectionService(): TicketSelectionService {
  let snapshot: TicketSelectionSnapshot = { selectedId: null };
  const listeners = new Set<() => void>();

  function update(selectedId: string | null) {
    if (snapshot.selectedId === selectedId) return;
    snapshot = { selectedId };
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select: id => update(id),
    clear: () => update(null),
  };
}
```

`select`、`clear` 是对外方法；`getSnapshot`、`subscribe` 用于让界面跟随状态更新。只提供无状态方法时，不需要实现订阅接口。快照在数据未变化时保持同一引用，变化后替换并通知订阅者；不要每次 `getSnapshot()` 都创建新对象。

<span id="在提供方注册服务"></span>

**在提供方注册服务**

将前面的 `plugins/ticket-actions/definition.ts` 更新为：

```ts
import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import {
  createTicketSelectionService,
  TICKET_SELECTION_SERVICE,
} from '../../services/ticket-selection';
import { TicketActions } from './index';
import manifest from './manifest.json';

export const ticketActionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  Component: TicketActions,
  provides: [TICKET_SELECTION_SERVICE],
  setup({ services }) {
    const selection = createTicketSelectionService();
    return services.provide(TICKET_SELECTION_SERVICE, selection);
  },
};

export default ticketActionsPlugin;
```

`provides` 只声明提供关系，实际注册由 `services.provide()` 完成。`setup` 同步创建每个活动实例自己的服务，返回的函数在实例停用或卸载时注销服务。不要在模块顶层创建全局单例；如果实现还持有连接或定时器，清理函数也需释放这些资源。同一服务作用域内不能有两个活动实例提供同名服务。

<span id="让提供方界面订阅状态"></span>

**让提供方界面订阅状态**

将 `plugins/ticket-actions/index.tsx` 更新为：

```tsx
import { useLocaleCode, usePluginService } from '@za38.03/agent-ui-plugins';
import { getProjectMessages } from '../../application/i18n/messages';
import {
  TICKET_SELECTION_SERVICE,
  type TicketSelectionService,
  type TicketSelectionSnapshot,
} from '../../services/ticket-selection';

const EMPTY_SELECTION: TicketSelectionSnapshot = { selectedId: null };

export function TicketActions() {
  const labels = getProjectMessages(useLocaleCode()).ticketActions;
  const selection = usePluginService<TicketSelectionService>(TICKET_SELECTION_SERVICE);
  const selectedId = usePluginService(selection, snapshot => snapshot.selectedId, EMPTY_SELECTION);

  return (
    <section data-ui-plugin="ticket-actions">
      <p>{labels.ready}</p>
      <output>{selectedId}</output>
      <button type="button" disabled={!selection || selectedId === null}
        onClick={() => selection?.clear()}>
        {labels.clear}
      </button>
    </section>
  );
}
```

组件可读取自己 `provides` 的服务，不要再把同一服务加入自己的 `inject`。`usePluginService` 管理订阅与取消订阅；fallback 快照放在组件外，保持引用稳定。

<span id="在另一个插件中调用"></span>

**在另一个插件中调用**

新建 `plugins/ticket-opener/manifest.json`：

```json
{
  "id": "ticket-opener",
  "name": "Ticket opener",
  "description": "Opens a ticket through the project selection service",
  "version": "0.0.1",
  "capabilities": ["ticket-action"]
}
```

新建 `plugins/ticket-opener/index.tsx`。Hook 在组件顶层取得服务，事件处理函数调用公开方法：

```tsx
import { useLocaleCode, usePluginService } from '@za38.03/agent-ui-plugins';
import { getProjectMessages } from '../../application/i18n/messages';
import {
  TICKET_SELECTION_SERVICE,
  type TicketSelectionService,
} from '../../services/ticket-selection';

export function TicketOpener() {
  const labels = getProjectMessages(useLocaleCode()).ticketActions;
  const selection = usePluginService<TicketSelectionService>(TICKET_SELECTION_SERVICE);

  return (
    <button data-ui-plugin="ticket-opener" type="button" disabled={!selection}
      onClick={() => selection?.select('T-1042')}>
      {labels.open}
    </button>
  );
}
```

新建 `plugins/ticket-opener/definition.ts`，声明必需的服务依赖：

```ts
import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { TICKET_SELECTION_SERVICE } from '../../services/ticket-selection';
import { TicketOpener } from './index';
import manifest from './manifest.json';

export const ticketOpenerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  Component: TicketOpener,
  inject: [TICKET_SELECTION_SERVICE],
};

export default ticketOpenerPlugin;
```

在已有布局插槽的 `plugins` 数组中加入调用方，保留前面的提供方实例及其他内容：

```json
{ "pluginId": "ticket-opener", "id": "ticket-opener-main" }
```

再次运行第 4 节的注册脚本和项目检查。两个实例都要启用，并位于同一个 Agent 的插件服务作用域中。`inject` 是必需依赖，提供方缺失时调用方无法启用；提供方恢复后可重新激活。若能力确实可选，改用 `optionalInject` 并实现可用的降级交互。读取未声明的服务会报错，不能只写 Hook 而遗漏依赖声明。这些 Hook 用于插件上下文，不能直接移到任意业务页面调用。

验证点击“打开示例工单”后，提供方显示 `T-1042`；点击“清除选择”后清空。停用提供方，确认必需依赖的调用方不可用；恢复后重新操作。切换语言，检查按钮文案。完整接口与非 React 生命周期中的消费方式见[自定义服务](./plugin-api#自定义服务)。

</details>

**继续接入业务能力**

开发时可以直接复用会话操作、状态 Hook、服务、事件、子插槽和消息展示接口。先查[公共能力速查](./plugin-api#公共能力速查)，各项提供使用前提和代码示例；插件组件和业务页面的接口入口也在其中区分。

已有插件可以提供历史消息、图表、文件、搜索结果和交互操作；按具体业务需求选择[插件联动与取数](./plugin-interaction)中的入口。

Plugins 支持按需打包。复用官方组件时，按[插件按需打包](./plugin-bundling)选择公开导入和样式入口，避免引入未使用的功能。

如果要将自己的内容放到工作台右侧，并由其他插件调用打开，见[多内容侧栏](/plugins/workbench-panel)的接入与调用步骤。
