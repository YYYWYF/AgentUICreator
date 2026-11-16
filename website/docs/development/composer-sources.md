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
