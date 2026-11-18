---
title: "提及搜索与快捷命令"
---

# 提及搜索与快捷命令

输入 `@` 搜索员工、文档等业务对象；输入 `/` 选择快捷命令。

以下路径以 `src/agent-ui/` 为源码目录。使用前先启用 `mention-trigger`，或 `slash-command-trigger` 与 `conversation-command-source`。

## @ 提及搜索

### 接入配置

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

### 数据格式

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

## / 快捷命令

### 接入配置

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

命令注册器由 `@za38.03/agent-ui-plugins/composer-triggers` 提供，模板不再复制 `services/composer-triggers.ts`。业务命令仍在上述插件文件中配置。

### 数据格式

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

未配置 `requestAdapter` 时，自定义文本按普通文本显示。需要结构化数据时使用下面的 `requestAdapter`；最终参数位置由 Composer 决定。

</details>

## 可选：把选中对象作为结构化数据发送 {#插件提供数据composer-组装请求}

业务代码写在项目自有应用层：@ 与 / 定义选中后产生的 JSON，Composer 定义最终请求。无需接管插件源码，不修改 `project-config` 或 AppUIModel。

配置分两步：先由触发器提供数据，再由 Composer 决定最终请求字段。

### 第 1 步：触发器产出 JSON {#-与--的-requestadapter定义数据格式}

在项目 `plugins/mention-trigger/index.tsx` 的已有组件调用处传入 `requestAdapter`：

```tsx
<Implementation
  {...props}
  source={props.source ?? source}
  requestAdapter={item => ({ employeeId: item.id, category: item.type })}
/>
```

回调同步接收一次选中的原始对象，包含 `id/type/label/description/data`，返回任意 JSON 值。插件通过公开的 `useComposer().setData` 保存结果，并将它绑定到本次引用；删除引用会移除对应数据。每次选择的数据独立保存，重复选择也会保留。

`/` 在项目 `plugins/slash-command-trigger/index.tsx` 中配置：

```tsx
<Implementation
  {...props}
  source={source}
  requestAdapter={command => ({ operation: command.id, params: command.data ?? null })}
/>
```

- **命令数据**：包含 `id/label/mode/description/disabled/data`，不包含 `execute` 函数。
- **动作命令**：默认 `action` 仍在选中时执行项目的 `execute()`，不自动进入消息；替换动作使用 `onSelect`。
- **发送适配**：`requestAdapter` 处理实际插入草稿的命令。

| 配置 | 正文与参数行为 |
| --- | --- |
| 未配置 `requestAdapter` | 保留默认引用正文和原有请求格式；原始选择仍可由 Composer 适配器读取。 |
| 配置 `requestAdapter` | 本地保留引用标签，发送正文移除该引用；数据默认放入 `forwardedProps[插件实例ID]` 的数组。 |
| 同时配置 `onSelect` 与 `requestAdapter` | 自定义文字和 JSON 数据可以一起发送。 |

`onSelect` 继续用于自定义插入文字或取消选择。选中对象中的附加 `data` 应为 JSON 数据。

### 第 2 步：Composer 组装最终请求 {#composer-的-requestadapter决定最终字段}

在项目已有的 `plugins/composer/index.tsx` 中，为 Composer 组件传入 `requestAdapter`，保留现有插槽和组件组合。下面示例假设 @ 与 / 的实例 ID 分别为 `employee-mention`、`command-picker`：

```tsx
<Implementation
  {...props}
  requestAdapter={({ request, pluginData }) => ({
    ...request,
    forwardedProps: {
      ctx: {
        employees: pluginData['employee-mention'] ?? [],
        commands: pluginData['command-picker'] ?? [],
      },
    },
  })}
/>
```

选择员工、命令并输入“查询待办”后，相关请求字段为：

```json
{
  "messages": [{ "id": "本轮消息ID", "role": "user", "content": "查询待办" }],
  "forwardedProps": {
    "ctx": {
      "employees": [{ "employeeId": "employee_84721", "category": "user" }],
      "commands": [{ "operation": "summarize", "params": null }]
    }
  }
}
```

`requestAdapter({ request, pluginData, selections })` 同步返回完整的 AG-UI 请求：

| 输入 | 内容 |
| --- | --- |
| `request` | 默认组装好的请求，包括已有的 `forwardedProps`、正文、附件与 Context。 |
| `pluginData` | 按插件实例 ID 分组的数据；引用型选择是数组，普通 `setData` 保留传入值。 |
| `selections` | 按同一身份分组的原始选中对象数组；可与格式化结果分别使用。 |

返回值就是最终请求，之后不再合并或补写 `forwardedProps`。用户可以任意重排、删除、改名，也可以返回 `forwardedProps: {}`。需要保留默认字段时，检查 `request.forwardedProps` 是对象后显式展开；其他请求字段通常用 `...request` 保留。AG-UI 的标准字段仍须满足协议类型。

也可以修改 `request.messages` 将 JSON 写入正文，或修改 `request.context` 放入标准的 `{ description, value }` 条目。插件只产出数据，不存在 @、/ 各自修改最终请求的先后顺序。

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

请求冲突按是否配置适配器处理：

- **未配置**：默认写入 `forwardedProps[插件实例ID]`，与已有字段同名时会报错。
- **已配置**：`request` 保留同名的已有字段；从 `pluginData` 读取插件数据，由用户处理冲突。

多个组件需要区分用途时，使用 `useComposer('用途名')`：

- 同一插件实例内，最终 key 为 `实例ID:用途名`。
- 没有插件实例上下文时，必须使用不同名称，key 为 `standalone:用途名`。

高级引用绑定、原始选择和默认发送开关见 [Composer API](/plugins/composer#hook)。它们用于数据与输入引用的生命周期，不限制最终请求结构。

</details>

<details class="dev-guide-details" id="技能引用和建议问题">
<summary>技能、引用和建议问题怎样加入同一份请求</summary>

这三个插件同样在各自应用层配置 `requestAdapter`，内部通过 `useComposer().setData` 交付 JSON。Composer 统一取得 `pluginData` 和原始 `selections`，返回最终请求：

```tsx
<Implementation {...props}
  requestAdapter={({ request, pluginData }) => ({
    ...request,
    forwardedProps: { ctx: pluginData },
  })} />
```

上例放在 Composer 应用层；各插件的适配器签名见对应文档：

| 插件 | 输入 | 无适配器时的默认请求 |
| --- | --- | --- |
| [skills](/plugins/skills#自定义发送数据) | 技能项，排除 React icon | `skill.ctx → forwardedProps.ctx`，与已有 ctx 合并 |
| [conversation-quote](/plugins/conversation-quote#自定义引用数据) | `{ text, messageId }` | Markdown 引用放在正文前 |
| [conversation-suggestions](/plugins/conversation-suggestions#自定义建议问题的数据) | `{ prompt, title?, label?, data? }` | 发送或填入原有 prompt 文本 |

配置插件适配器后，默认将返回值放到该插件实例对应的外带字段；引用会取消默认 Markdown 前缀，技能会取消默认运行字段，建议问题保留 prompt 正文。最终 Composer 适配器可以覆盖这些默认选择，也可以返回空的 `forwardedProps`。

技能和引用的数据值为对象或插件返回的 JSON；建议项与 @、/ 的引用型数据为数组。原始技能项不携带 React icon，命令项不携带 execute；所有持久化选择必须是 JSON。`skills-selection` 只显示和移除同一份技能选择，不额外生成一份数据。

</details>

<details class="dev-guide-details" id="发送重发与恢复">
<summary>排队、重试、恢复和刷新后的数据生命周期</summary>

@、/ 的 `requestAdapter(item)` 在选择时调用；Composer 的 `requestAdapter({ request, pluginData, selections })` 在每次实际请求发送前调用，包括工具续传和中断恢复。续传读取原次提交的数据快照与本次协议字段，不读取下一条草稿，也不会重新执行选择动作。一个 Agent 的 Composer 只注册一个最终适配器；第三方插件只提交数据。

按钮、回车与原生队列共用发送链。提交后清理本次草稿数据，下一条消息不自动继承。队列数据按提交时固定，后续选择、对象修改或切换 Thread 不改变已有快照。编辑重发只带仍存在的引用；重试使用原消息的数据。原生发送配置保持原有生命周期，默认业务参数统一发送到 `forwardedProps.ctx`。

刷新后如需恢复结构化数据与引用编辑能力，业务历史需保留原始前端消息及其私有元数据；仅保存处理后的正文无法重建原始选择。没有元数据的旧普通引用继续作为正文发送，不会凭空补造业务数据。内部草稿元数据和选路控制字段在适配器之前剥离，不自动发送给后端。

@、/ 的 `requestAdapter` 抛错或返回非 JSON 时保留原输入并显示现有错误提示。Composer 的 `requestAdapter` 抛错、返回 Promise 或返回无效请求时，通过 `onError` 报告并停止发送，不退回默认请求；修正后可以重试。



</details>
