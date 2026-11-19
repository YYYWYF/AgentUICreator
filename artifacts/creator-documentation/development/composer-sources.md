# 提及搜索与快捷命令

输入 `@` 搜索员工、文档等业务对象；输入 `/` 选择快捷命令。

<figure className="plugin-preview">

![输入 @产品 后显示文档候选列表](/images/plugins/mention-trigger.png)

<figcaption>@ 搜索把来源返回的 label 和 description 显示为候选；此时仍在查询，还没有选中引用。</figcaption>
</figure>

以下路径以 `src/agent-ui/` 为源码目录。使用前先启用 `mention-trigger`，或 `slash-command-trigger` 与 `conversation-command-source`。

**先选择你要接入或修改的功能：**

| 你的需求          | 从哪里开始                           | 修改位置                                                |
| ------------- | ------------------------------- | --------------------------------------------------- |
| 输入 @ 搜索员工或文档  | [接入 @ 搜索](#-提及搜索)               | `plugins/mention-trigger/index.tsx`                 |
| 输入 / 加载业务命令   | [接入 / 命令](#-快捷命令)               | `plugins/conversation-command-source/definition.ts` |
| 改选中后插入草稿的文字   | [改变选中行为](#改变选中行为)               | 对应触发器的 `onSelect`                                   |
| 保留正文标签并发送选中对象 | [发送结构化数据](#插件提供数据composer-组装请求) | 来源中的选项数据与 Composer 的 `requestAdapter`               |

## 接入 @ 提及搜索 \{#-提及搜索}

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

| 字段            | 类型       | 说明                                |
| ------------- | -------- | --------------------------------- |
| `id`          | `string` | 必填，稳定且唯一的业务对象 ID。                 |
| `type`        | `string` | 必填，与 Agent 后端约定的引用类型；`user` 仅为示例。 |
| `label`       | `string` | 必填，列表和输入框中显示的名称。                  |
| `description` | `string` | 可选，列表中的补充说明。                      |

接口字段不同时，在 `source.search()` 返回前转换为上述格式。

</details>

## 接入 / 快捷命令 \{#-快捷命令}

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

命令注册器由 `@za38.03/agent-ui-plugins/composer-triggers` 提供，模板不再复制 `services/composer-triggers.ts`。业务命令仍在上述插件文件中配置。

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

| 字段            | 类型                         | 说明                                                        |
| ------------- | -------------------------- | --------------------------------------------------------- |
| `id`          | `string`                   | 必填，稳定且唯一的命令标识，不能与默认命令 `new` 重复。                           |
| `label`       | `string`                   | 必填，菜单中显示的名称。                                              |
| `description` | `string`                   | 可选，菜单中的补充说明。                                              |
| `mode`        | `'directive'` 或 `'action'` | 必填，`directive` 将指令加入草稿，由用户发送；`action` 在选中时执行 `execute()`。 |
| `disabled`    | `boolean`                  | 可选，是否禁用该命令，默认为 `false`。                                   |
| `data`        | `unknown`                  | 可选，项目自定义的 JSON 业务数据；发送时由 Composer 读取选中项并组装。               |

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

## 可选：改变选中后的草稿内容 \{#改变选中行为}

<span id="选中后默认发送什么"></span>

`@` 和 `/ directive` 选中后只修改草稿，不立即发送。默认引用写在用户消息的 `content` 中：

| 选中项                                                   | 草稿和发送正文中的引用                      |
| ----------------------------------------------------- | -------------------------------- |
| `{ type: 'user', id: 'employee_84721', label: '张三' }` | `:user[张三]{name=employee_84721}` |
| `{ id: 'summarize', label: '总结', mode: 'directive' }` | `:command[总结]{name=summarize}`   |

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

| 返回值        | 对草稿的影响                           |
| ---------- | -------------------------------- |
| 字符串        | 替换当前 `@词` / `/词` 区间；非空字符串后按需补空格。 |
| `null` 或空串 | 移除该区间。                           |

`range` 为 `{ start, end }`，不包含 end 位置。区间外的其他文字保留。

提供回调就完全替换默认处理，包括 `/ action` 的执行。返回后不再插入默认引用，不自动发送。抛错时保留草稿并显示本地化错误，不退回默认行为。需要异步数据时先在来源中加载；异步页面操作可继续使用默认 `action.execute()`。

自定义普通文本按普通文本显示；要保留标签，应返回合法的引用标记。实际插入的非空文本仍绑定原始选中项，Composer 可以读取并组装其数据，见下文。

</details>

## 可选：把选中对象作为结构化数据发送 \{#插件提供数据composer-组装请求}

业务代码写在项目自有应用层：@ 与 / 的来源直接定义候选项和业务数据，触发器保留正文引用并记录选中项，Composer 定义最终请求。无需接管插件源码，不修改 `project-config` 或 AppUIModel。

触发器没有 `requestAdapter`。选中时只更新草稿，不发送请求；发送时由 Composer 的 `requestAdapter` 将选中项放到 `forwardedProps`，正文中的引用标记保持不变。

### 第 1 步：在来源中定义选项数据 \{#-与--的选项数据}

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

已有项目若配置了触发器 `requestAdapter`，移除该属性，将其业务字段选择逻辑移到 Composer 的回调中，从 `selections` 读取原始选中项。此 API 调整不会自动改写既有项目文件。

### 第 2 步：Composer 组装最终请求 \{#composer-的-requestadapter决定最终字段}

在项目已有的 `plugins/composer/index.tsx` 中，为 Composer 组件传入 `requestAdapter`，保留现有插槽和组件组合。下面示例假设 @ 与 / 的实例 ID 分别为 `employee-mention`、`command-picker`：

```tsx
<Implementation
  {...props}
  requestAdapter={({ request, selections }) => ({
    ...request,
    forwardedProps: {
      ctx: {
        employees: selections['employee-mention'] ?? [],
        commands: selections['command-picker'] ?? [],
      },
    },
  })}
/>
```

选择员工、命令并输入“查询待办”后，相关请求字段为：

```json
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

上例发送完整选中项；如果后端只需要其中的 `data` 或其他字段，在同一个 Composer 回调中收窄并提取即可。@ 与 / 在 `pluginData` 中也提供相同的原始选中项数组。

`requestAdapter({ request, pluginData, selections, sources })` 同步返回完整的 AG-UI 请求：

| 输入           | 内容                                                |
| ------------ | ------------------------------------------------- |
| `request`    | 默认组装好的请求，包括已有的 `forwardedProps`、正文、附件与 Context。   |
| `pluginData` | 按插件实例 ID 分组的数据；引用型选择是数组，普通 `setData` 保留传入值。       |
| `selections` | 按同一身份分组的原始选中对象数组；可与格式化结果分别使用。                     |
| `sources`    | 自动记录的插件 ID、实例 ID 和可选用途名；与 `pluginData` 使用相同的所有者键。 |

返回值就是最终请求，之后不再合并或补写 `forwardedProps`。用户可以任意重排、删除、改名，也可以返回 `forwardedProps: {}`。需要保留默认字段时，检查 `request.forwardedProps` 是对象后显式展开；其他请求字段通常用 `...request` 保留。AG-UI 的标准字段仍须满足协议类型。

也可以修改 `request.messages` 将 JSON 写入正文，或修改 `request.context` 放入标准的 `{ description, value }` 条目。插件只产出数据，不存在 @、/ 各自修改最终请求的先后顺序。

历史消息要继续显示标签，后端保存并返回带引用标记的正文即可；只返回普通 `@张三` 或 `/总结` 文本不会恢复标签，见[历史数据格式](/development/history-backend.md#数据格式参考)。

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

- **未配置**：普通 `setData(value)` 只收集数据，不自动写入外带字段。
- **已配置**：从 `pluginData` 读取数据，结合 `sources` 识别来源，由用户决定映射和冲突处理。

多个组件需要区分用途时，使用 `useComposer('用途名')`：

- 同一插件实例内，最终 key 为 `实例ID:用途名`。
- 没有插件实例上下文时，必须使用不同名称，key 为 `standalone:用途名`。

高级引用绑定、原始选择和默认发送开关见 [Composer API](/plugins/composer.md#hook)。它们用于数据与输入引用的生命周期，不限制最终请求结构。

</details>

<details class="dev-guide-details" id="技能引用和建议问题">
<summary>技能、引用和建议问题怎样加入同一份请求</summary>

技能相关文档标记为**开发中**，见[技能选择（开发中）](/plugins/skills.md)。

技能由 `conversation.skills` Service 管理 UI 状态，通过 `composer.setData({ id, label })` 交付发送数据；引用和建议问题保留各自的 `requestAdapter`，通过 `useComposer().setData` 交付 JSON。Composer 统一取得 `pluginData` 和原始 `selections`，返回最终请求：

```tsx
<Implementation {...props}
  requestAdapter={({ request, pluginData }) => ({
    ...request,
    forwardedProps: { ctx: pluginData },
  })} />
```

上例放在 Composer 应用层；各插件的适配器签名见对应文档：

| 插件                                                                          | 输入                                  | 无适配器时的默认请求                                |
| --------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| [skills（开发中）](/plugins/skills.md#自定义发送数据)                                   | `{ id, label }`                     | `forwardedProps.ctx.skill`，保留已有 ctx 的其他字段 |
| [conversation-quote](/plugins/conversation-quote.md#自定义引用数据)                | `{ text, messageId }`               | Markdown 引用放在正文前                          |
| [conversation-suggestions](/plugins/conversation-suggestions.md#自定义建议问题的数据) | `{ prompt, title?, label?, data? }` | 发送或填入原有 prompt 文本                         |

配置插件适配器后，默认将返回值放到该插件实例对应的外带字段；引用会取消默认 Markdown 前缀，建议问题保留 prompt 正文；技能的默认 `ctx.skill` 映射位于生成项目的 `plugins/composer/request-adapter.ts`，用户可以修改。最终 Composer 适配器可以覆盖这些默认选择，也可以返回空的 `forwardedProps`。

技能和引用的数据值为对象或插件返回的 JSON；建议项与 @、/ 的引用型数据为数组。原始技能项不携带 React icon，命令项不携带 execute；所有持久化选择必须是 JSON。`skills` 在 Composer 的 `triggers` 中提供选择入口，`skills-selection` 在 `beforeInput` 中显示和移除选择，两者共享一份 Composer 状态；Composer 不内置技能展示。发送后的只读标签来自消息元数据。

</details>

<details class="dev-guide-details" id="发送重发与恢复">
<summary>排队、重试、恢复和刷新后的数据生命周期</summary>

@、/ 在选择时保存原始选中项的 JSON 快照；Composer 的 `requestAdapter({ request, pluginData, selections, sources })` 在每次实际请求发送前调用，包括工具续传和中断恢复。续传读取原次提交的数据快照与本次协议字段，不读取下一条草稿，也不会重新执行选择动作。一个 Agent 的 Composer 只注册一个最终适配器；第三方插件只提交数据。

按钮、回车与原生队列共用发送链。提交后清理本次草稿数据，下一条消息不自动继承。队列数据按提交时固定，后续选择、对象修改或切换 Thread 不改变已有快照。编辑重发只带仍存在的引用；重试使用原消息的数据。原生发送配置保持原有生命周期，默认业务参数统一发送到 `forwardedProps.ctx`。

刷新后，正文保留引用标记即可恢复标签展示。若还要恢复原始选中项数据、编辑重发时的结构化参数，则需另外保留对应选择快照及关联信息；仅凭引用标记无法还原 `data`。当前数据生命周期使用原始前端消息的私有元数据绑定选择，内部草稿元数据和选路控制字段在适配器之前剥离，不自动发送给后端；项目需按历史存储约定保存和恢复这些信息。没有元数据的旧引用继续作为正文发送，不会凭空补造业务数据。

@、/ 的选中项包含非 JSON 数据，或 `onSelect` 抛错时，保留原输入并显示现有错误提示。Composer 的 `requestAdapter` 抛错、返回 Promise 或返回无效请求时，通过 `onError` 报告并停止发送，不退回默认请求；修正后可以重试。

</details>

## 检查查询与发送结果 \{#检查查询与发送结果}

分别输入 @ 和 /，检查菜单结果及选中后的草稿；若配置了页面动作，确认选中时执行的是预期操作。

调试时在浏览器 Network 查看最终请求体，检查引用删除、编辑重发、排队和下一条普通消息。这些配置属于项目应用层，npm 升级和插件实现源码同步不会覆盖它们。
