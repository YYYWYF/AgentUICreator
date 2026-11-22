---
title: "提及搜索与快捷命令"
---

# 提及搜索与快捷命令

输入 `@` 搜索员工、文档等业务对象；输入 `/` 选择快捷命令。

<figure className="plugin-preview">

![输入 @产品 后显示文档候选列表](/images/plugins/mention-trigger.png)

<figcaption>@ 搜索把来源返回的 label 和 description 显示为候选；此时仍在查询，还没有选中引用。</figcaption>
</figure>

以下路径以 `src/agent-ui/` 为源码目录。使用前先启用 `mention-trigger`，或 `slash-command-trigger` 与 `conversation-command-source`。

**先选择你要接入或修改的功能：**

| 你的需求 | 从哪里开始 | 修改位置 |
| --- | --- | --- |
| 输入 @ 搜索员工或文档 | [接入 @ 搜索](#-提及搜索) | `plugins/mention-trigger/index.tsx` |
| 输入 / 加载业务命令 | [接入 / 命令](#-快捷命令) | `plugins/conversation-command-source/definition.ts` |
| 改选中后插入草稿的文字 | [改变选中行为](#改变选中行为) | 对应触发器的 `onSelect` |
| 保留正文标签并发送选中对象 | [发送结构化数据](#插件提供数据composer-组装请求) | 来源中的选项数据与 Composer 的 `requestAdapter` |

## 接入 @ 提及搜索 {#-提及搜索}

**第 1 步：填写查询请求。**

<span id="接入配置"></span>

打开 **`src/agent-ui/plugins/mention-trigger/index.tsx`**，在文件顶部已有的 **`source.search()`** 中填写查询请求：

```ts
export const source: ConversationMentionSource = {
  async search(_input): Promise<readonly ConversationMentionItem[]> {
    // 在这里调用项目的查询请求。
    // _input.query 是用户输入的搜索词；_input.signal 用于取消请求。
    // 将接口结果整理为下节的数组，并在这里返回。
    return []; // 接入时替换为实际查询结果。
  },
};
```

输入 `@` 和搜索词后，组件会自动调用这个方法并显示结果。也可以在方法中筛选项目已加载的数据并返回。

父组件可通过 `<ConversationMentionTrigger source={mentionSource} />` 传入搜索配置；此时请求写在 `mentionSource.search()` 中。

**第 2 步：按下面的字段返回查询结果。**

<details class="dev-guide-details" id="数据格式">
<summary>查看搜索结果字段与完整示例</summary>

`source.search()` 异步返回以下数组；没有匹配结果时返回 `[]`：

```json
[
  {
    "id": "employee_84721",
    "type": "user",
    "label": "张三",
    "description": "产品部"
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 必填，稳定且唯一的业务对象 ID。 |
| `type` | `string` | 必填，与 Agent 后端约定的引用类型；`user` 仅为示例。 |
| `label` | `string` | 必填，列表和输入框中显示的名称。 |
| `description` | `string` | 可选，列表中的补充说明。 |

接口字段不同时，在 `source.search()` 返回前转换为上述格式。

</details>

## 接入 / 快捷命令 {#-快捷命令}

<figure className="plugin-preview">

![输入斜杠后出现新建会话和总结对话菜单](/images/plugins/slash-command-trigger.png)

<figcaption>/ 菜单可以同时包含页面动作和待发送指令。选中后的行为由条目的 mode 决定。</figcaption>
</figure>

**第 1 步：填写命令列表请求。**

<span id="接入配置-1"></span>

打开 **`src/agent-ui/plugins/conversation-command-source/definition.ts`**，在文件顶部已有的 **`businessCommands.loadCommands()`** 中填写命令列表请求：

```ts
export const businessCommands = {
  async loadCommands(_input: { locale: AgentUILocaleCode; signal: AbortSignal }): Promise<readonly ConversationSlashCommand[]> {
    // 在这里调用项目的命令列表请求。
    // _input.locale 是当前语言；_input.signal 用于取消请求。
    // 将接口结果整理为下节的数组，并在这里返回。
    return []; // 接入时替换为实际命令列表。
  },
};
```

组件会自动加载命令并显示到 `/` 菜单，语言切换时重新加载。

**第 2 步：按命令类型返回指令或页面操作。**

<details class="dev-guide-details" id="数据格式-1">
<summary>查看命令字段、指令模式与动作示例</summary>

`businessCommands.loadCommands()` 返回以下数组；返回 `[]` 时只保留默认“新建会话”命令：

```json
[
  {
    "id": "summarize",
    "label": "总结当前会话",
    "description": "将总结指令加入草稿",
    "mode": "directive",
    "disabled": false
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 必填，稳定且唯一的命令标识，不能与默认命令 `new` 重复。 |
| `label` | `string` | 必填，菜单中显示的名称。 |
| `description` | `string` | 可选，菜单中的补充说明。 |
| `mode` | `'directive'` 或 `'action'` | 必填，`directive` 将指令加入草稿，由用户发送；`action` 在选中时执行 `execute()`。 |
| `disabled` | `boolean` | 可选，是否禁用该命令，默认为 `false`。 |
| `data` | `unknown` | 可选，项目自定义的 JSON 业务数据；发送时由 Composer 读取选中项并组装。 |

`label` 和 `description` 使用当前界面语言的文案。接口字段不同时，在 `businessCommands.loadCommands()` 返回前转换为上述格式。

执行页面操作的命令使用 `mode: 'action'`，在 `execute()` 中填写操作：

```ts
// businessCommands.loadCommands() 内返回的命令示意。
return [{
  id: 'refresh_business_data',
  label: actionLabel, // 从项目语言层取得当前语言的命令名称。
  mode: 'action',
  execute() {
    // 在这里调用页面方法或发起业务请求。
  },
}];
```

接口返回动作类命令时，在项目代码中按命令 ID 补上 `execute()` 后再返回。

</details>

## 可选：改变选中后的草稿内容 {#改变选中行为}

<span id="选中后默认发送什么"></span>

`@` 和 `/ directive` 选中后只修改草稿，不立即发送。默认引用写在用户消息的 `content` 中：

| 选中项 | 草稿和发送正文中的引用 |
| --- | --- |
| `{ type: 'user', id: 'employee_84721', label: '张三' }` | `:user[张三]{name=employee_84721}` |
| `{ id: 'summarize', label: '总结', mode: 'directive' }` | `:command[总结]{name=summarize}` |

默认发送规则：

- ID 与 label 相同时，省略 `{name=...}`。
- `description` 和可选的 `data: unknown` 是候选项数据，默认不会发送，也不会自动查询对象详情或放入 `ctx`。
- `/ action` 默认只调用 `execute()`，触发器不自动发送消息。

后端按项目约定解析引用。

<figure className="plugin-preview">

![引用标记在 Lexical 输入中显示为提及和命令标签](/images/plugins/lexical-composer-input.png)

<figcaption>启用 Lexical 输入后，引用标记显示为“@产品说明文档”和“/总结对话”标签。普通输入框直接显示上表中的标记文本。</figcaption>
</figure>

<details class="dev-guide-details" id="在项目中替换选中行为">
<summary>用 onSelect 替换默认引用文字或动作</summary>

修改项目 `plugins/mention-trigger/index.tsx` 或 `plugins/slash-command-trigger/index.tsx` 的已有组件调用，传入 `onSelect`，无需接管源码：

```tsx
// @：替换为项目自己的文本表示。
<Implementation
  {...props}
  source={props.source ?? source}
  onSelect={item => `employee(${item.id})`}
/>
```

这是已有组件调用的替换片段，保留所在文件的其他代码。`Implementation` 是该文件已有的实现导入。`/` 同样可以传 `onSelect`：

```tsx
<Implementation
  {...props}
  source={source}
  onSelect={command => {
    if (command.mode === 'action') {
      // 此例移除查询但不执行默认动作；需要执行时由项目调用 execute() 并处理失败。
      return null;
    }
    return `operation(${command.id})`;
  }}
/>
```

`onSelect(item, { text, range })` 是同步回调，可取得完整候选项，包括项目的 `data`；动作命令还带 `execute()`。

| 返回值 | 对草稿的影响 |
| --- | --- |
| 字符串 | 替换当前 `@词` / `/词` 区间；非空字符串后按需补空格。 |
| `null` 或空串 | 移除该区间。 |

`range` 为 `{ start, end }`，不包含 end 位置。区间外的其他文字保留。

提供回调就完全替换默认处理，包括 `/ action` 的执行。返回后不再插入默认引用，不自动发送。抛错时保留草稿并显示本地化错误，不退回默认行为。需要异步数据时先在来源中加载；异步页面操作可继续使用默认 `action.execute()`。

自定义普通文本按普通文本显示；要保留标签，应返回合法的引用标记。实际插入的非空文本仍绑定原始选中项，Composer 可以读取并组装其数据，见下文。

</details>

## 可选：把选中对象作为结构化数据发送 {#插件提供数据composer-组装请求}

在来源中提供业务数据，再由 Composer 的 `requestAdapter` 决定发送位置。选中时只更新草稿，发送时才组装请求，无需接管插件源码。

### 第 1 步：在来源中定义选项数据 {#-与--的选项数据}

在项目 `plugins/mention-trigger/index.tsx` 的 `source.search()` 中返回候选项，业务字段可以直接放在 `data` 中：

```json
{
  "id": "employee_84721",
  "type": "user",
  "label": "张三",
  "data": { "employeeId": "employee_84721", "category": "user" }
}
```

`id/type/label` 用于引用身份与标签展示，`description` 用于菜单说明，`data` 的结构由项目决定。选中项会以 JSON 快照绑定到本次引用；删除引用会移除对应数据，重复选择会保留多项记录。`data` 应为 JSON，不放函数、DOM 或循环对象。

`/` 的业务数据直接写在项目 `plugins/conversation-command-source/definition.ts` 返回的命令项中：

```json
{
  "id": "summarize",
  "label": "总结",
  "mode": "directive",
  "data": { "operation": "summarize", "params": null }
}
```

- **命令选中项**：包含 `id/label/mode` 及已有的 `description/disabled/data`，不包含 `execute` 函数。
- **动作命令**：默认 `action` 在选中时执行项目的 `execute()`，不自动进入消息或结构化选择；替换动作使用 `onSelect`。
- **正文引用**：默认保留 `:user[张三]{name=employee_84721}` 和 `:command[总结]{name=summarize}`。Composer 只组装外带参数时，不会删除这些标记。

未配置 Composer 适配器时，@ 与 / 沿用正文引用格式，不自动添加结构化外带字段。`onSelect` 继续用于自定义插入文字或取消选择。

### 第 2 步：Composer 组装最终请求 {#composer-的-requestadapter决定最终字段}

在项目已有的 `plugins/composer/index.tsx` 中，为 Composer 组件传入 `requestAdapter`，保留现有插槽和组件组合。下面示例假设 @ 与 / 的实例 ID 分别为 `employee-mention`、`command-picker`：

```tsx
import type { ComponentProps } from 'react';
import type { ComposerRequestAdapter } from '@za38.03/agent-ui-plugins';
import { ConversationComposerPlugin as Implementation } from '@za38.03/agent-ui-plugins/composer';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}

export const requestAdapter: ComposerRequestAdapter = ({ request, pluginData }) => {
  const fields = {
    ...(Object.hasOwn(pluginData, 'employee-mention')
      ? { employees: pluginData['employee-mention'] } : {}),
    ...(Object.hasOwn(pluginData, 'command-picker')
      ? { commands: pluginData['command-picker'] } : {}),
  };
  if (Object.keys(fields).length === 0) return request;
  const forwardedProps = record(request.forwardedProps);
  return {
    ...request,
    forwardedProps: {
      ...forwardedProps,
      ctx: { ...record(forwardedProps.ctx), ...fields },
    },
  };
};

export function ConversationComposerPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} requestAdapter={requestAdapter} />;
}
```

只有 `pluginData` 中存在对应实例键时才添加 `employees` 或 `commands`；两者都未提交时保留原请求。插件明确提交的空数组、`null` 等 JSON 值按原值发送，不用默认值代替，也不按真假值过滤。

选择员工、命令并输入“查询待办”后，相关请求字段为：

```json ag-ui
{
  "messages": [{
    "id": "本轮消息ID",
    "role": "user",
    "content": ":user[张三]{name=employee_84721} :command[总结]{name=summarize} 查询待办"
  }],
  "forwardedProps": {
    "ctx": {
      "employees": [{
        "id": "employee_84721", "type": "user", "label": "张三",
        "data": { "employeeId": "employee_84721", "category": "user" }
      }],
      "commands": [{
        "id": "summarize", "label": "总结", "mode": "directive",
        "data": { "operation": "summarize", "params": null }
      }]
    }
  }
}
```

上例从 `pluginData` 读取并发送完整选中项；如果后端只需要其中的 `data` 或其他字段，在同一个 Composer 回调中收窄并提取即可。

`requestAdapter({ request, pluginData, sources })` 同步返回完整的 AG-UI 请求：

| 输入 | 内容 |
| --- | --- |
| `request` | 默认组装好的请求，包括已有的 `forwardedProps`、正文、附件与 Context。 |
| `pluginData` | 按插件实例 ID 分组的数据；引用型选择是数组，普通 `setData` 保留传入值。 |
| `sources` | 自动记录的插件 ID、实例 ID 和可选用途名；与 `pluginData` 使用相同的所有者键。 |

Composer 使用回调返回的完整请求，不会补回被删除的字段；保留原字段时像示例一样展开 `...request`。如果还配置了 [`beforeRequest`](./connect-agent#发送前准备请求)，它会在之后执行，可继续补充或修改请求。

也可以修改 `request.messages`，或在 `request.context` 中加入 `{ description, value }` 条目。

历史消息要继续显示标签，后端保存并返回带引用标记的正文即可；只返回普通 `@张三` 或 `/总结` 文本不会恢复标签，见[历史数据格式](./history-backend#数据格式参考)。

<details class="dev-guide-details" id="第三方插件用同一个接口">
<summary>让自己的插件提交草稿数据</summary>

在已有插件组件中：

```tsx
import { useComposer } from '@za38.03/agent-ui-plugins';
import type { ReactNode } from 'react';

export function OrderDraftData({ orderId, children }: {
  orderId: string;
  children: ReactNode;
}) {
  const composer = useComposer();
  return <button type="button" onClick={() => composer.setData({ orderId })}>{children}</button>;
}
```

数据写入与清理：

- `setData` 立即校验并复制 JSON；函数、非有限数字、循环对象等会抛错。重复调用会替换本插件的数据。
- `clearData()` 清除自己的草稿数据，不影响其他插件或 Thread。

业务字段由 Composer 统一映射：

- **未配置**：普通 `setData(value)` 只收集数据，不自动写入外带字段。
- **已配置**：从 `pluginData` 读取数据，结合 `sources` 识别来源，由用户决定映射和冲突处理。

多个组件需要区分用途时，使用 `useComposer('用途名')`：

- 同一插件实例内，最终 key 为 `实例ID:用途名`。
- 没有插件实例上下文时，必须使用不同名称，key 为 `standalone:用途名`。

正文引用与原生引用的数据绑定见 [Composer API](/plugins/composer#hook)。这些选项只处理数据生命周期；业务数据只通过 `pluginData` 交给最终适配器。

</details>

<details class="dev-guide-details" id="技能引用和建议问题">
<summary>技能、引用和建议问题怎样加入同一份请求</summary>

技能相关文档标记为**开发中**，见[技能选择（开发中）](/plugins/skills)。

这些插件也通过 `pluginData` 提供数据，统一在 Composer 中转换，见[完整组装示例](/plugins/composer#统一组装业务字段)。没有相关选择时，不新增空字段。

这些映射放在 Composer 应用层；各插件提交的实际格式见对应文档：

| 插件 | 提交到 pluginData 的数据 | 默认发送位置 |
| --- | --- | --- |
| [skills（开发中）](/plugins/skills#自定义发送数据) | `{ id, label }` | `forwardedProps.ctx.skill`，保留已有 ctx 的其他字段 |
| [conversation-quote](/plugins/conversation-quote#自定义引用数据) | `{ text, messageId }` | Markdown 引用放在正文前 |
| [conversation-suggestions](/plugins/conversation-suggestions#自定义建议问题的数据) | `[{ prompt, title?, label?, data? }]` | 发送或填入原有 prompt 文本 |

默认技能映射写在 `plugins/composer/request-adapter.ts`，可按业务修改。引用会加入正文，建议问题使用 `prompt`；详细行为见各插件页。

</details>

<details class="dev-guide-details" id="发送重发与恢复">
<summary>重试、恢复和刷新后的数据生命周期</summary>

| 场景 | 数据如何处理 |
| --- | --- |
| 提交 | 保存本次选择，后续修改草稿不影响它；下一条消息不自动继承。 |
| 重试、工具续传或审批恢复 | 使用原次提交的数据，Composer 回调会再次执行。 |
| 编辑后重发 | 只保留消息中仍存在的引用及对应选择。 |
| 刷新后打开历史 | 正文引用可恢复标签；还要恢复原始 `data` 时，历史服务需另外保存选择数据。 |

选择数据必须是 JSON。转换出错时保留草稿并提示；Composer 回调报错或返回无效请求时停止发送，修正后可重试。
</details>

## 检查查询与发送结果 {#检查查询与发送结果}

分别输入 @ 和 /，检查菜单结果及选中后的草稿；若配置了页面动作，确认选中时执行的是预期操作。

调试时在浏览器 Network 查看最终请求体，检查引用删除、编辑重发和下一条普通消息。这些配置属于项目应用层，npm 升级和插件实现源码同步不会覆盖它们。
