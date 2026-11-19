---
title: "会话命令源（conversation-command-source）"
---

# 会话命令源（conversation-command-source）

<figure className="plugin-preview">

![命令注册界面](/images/plugins/slash-command-trigger.png)

<figcaption>命令注册后的 / 菜单；此图展示消费命令源的触发器，本服务没有独立界面。</figcaption>
</figure>

集中提供 `/` 菜单中的指令和动作。业务插件启用时注册自己的命令，停用时注销；菜单订阅这个集合，不需要每个业务插件自己再实现一套搜索弹层。

## 与 Composer 联动

<span id="注册草稿指令"></span>

本插件提供命令源服务，本身没有独立界面。[/ 快捷命令](./slash-command-trigger)消费同一作用域服务，选中 `directive` 时插入草稿，选中 `action` 时执行项目回调。默认新建会话命令是动作，仅在选择时新建 Thread。

注册项的 `id` 是稳定身份，`label` 用于菜单与引用展示，`data` 可附加 JSON 业务数据。下面的指令注册后即可由 `/` 菜单选择：

```tsx
import type { ConversationCommandRegistry } from '@za38.03/agent-ui-plugins/composer-triggers';

export function registerSummary(registry: ConversationCommandRegistry, label: string) {
  return registry.register({
    id: 'project.summarize', label, mode: 'directive', data: { taskType: 'summary' },
  });
}
```

注册不会填入或发送草稿。真正选择后，结构化快照归**命令触发器实例**所有，不以 `conversation-command-source` 再建一个键；原始条目、默认正文格式、删除与最终适配规则见[命令交给 Composer 的数据](./slash-command-trigger#交给-composer-的数据)。

## 注册项目动作命令 {#注册项目动作命令}

<span id="example-1"></span>

在现有 setup 中取得同作用域注册器，调用本函数，返回并合并注销函数。label 从项目共享文案传入。

```tsx
import type { ConversationCommandRegistry } from '@za38.03/agent-ui-plugins/composer-triggers';

export function registerAction(registry: ConversationCommandRegistry, label: string, open: () => void) {
  return registry.register({ id: 'project.open-report', label, mode: 'action', execute: open });
}
```

<span id="example-2"></span>

## 命令注册与注销 {#随业务插件启停注册命令}

组件与服务位于同一 Agent，并声明 `conversation.slash-command-source` 依赖。

```tsx
import type { UIPluginSetupContext } from '@za38.03/agent-ui-plugins/contracts';
import { CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry }
  from '@za38.03/agent-ui-plugins/composer-triggers';

// 供调用方已有 definition.setup 调用，并合并其清理函数。
export function registerProjectCommand(context: UIPluginSetupContext, label: string) {
  const registry = context.services.get(CONVERSATION_COMMAND_SOURCE) as ConversationCommandRegistry | undefined;
  return registry?.register({
    id: 'project.new-conversation',
    label,
    mode: 'action',
    execute: () => context.actions.startNewConversation(),
  });
}
```

在调用方已有 `setup` 中执行 `registerProjectCommand(context, label)`，并保存返回的注销函数；在其清理函数中调用它，同时保留原清理逻辑。启用调用方后 `/` 菜单出现该命令，停用后移除；选择时才触发新建会话。

## 订阅命令集合

调用同一注册器的 `getSnapshot()` 可读取当前命令，`subscribe(listener)` 可跟随注册与注销；取消订阅和 `register()` 返回的注销函数都要并入调用方原有清理。这里订阅的是候选集合，不是 Composer 草稿或已选指令。读取当前草稿使用 [Composer 的订阅接口](./composer#hook)。

## API

<span id="属性"></span>
<span id="开发-api"></span>

### 命令配置 {#命令配置}

命令通常在生成源码目录的 `plugins/conversation-command-source/definition.ts` 中配置；菜单展示在 `plugins/slash-command-trigger/index.tsx` 中调整。已有工程以实际文件为准。

修改命令无需接管插件实现源码。更多菜单定制见[/ 快捷命令](./slash-command-trigger)，实际 Creator 操作记录见[自定义 @ 候选与 / 命令](/guide/adjustments/mention-and-commands)。

<span id="开发文档"></span>

- 配置入口与命令数据格式：[提及搜索与快捷命令](/development/composer-sources)。
- 在自定义插件中提供或消费命令服务：[服务共享与状态订阅](/development/plugin-api#服务共享与状态订阅)。

<span id="取数与联动"></span>

业务插件可取得现有命令注册器，读取命令集合，或在启用时注册自己的命令；命令可以填入草稿或执行项目操作。注册返回的注销函数应在停用或卸载时执行，见[调用示例](#随业务插件启停注册命令)。

### 服务方法 {#服务}

提供 `conversation.slash-command-source`，值为 `ConversationSlashCommandSource`。应用默认使用 `createConversationCommandRegistry(): ConversationCommandRegistry`。

| 注册器成员 | 用途 |
| --- | --- |
| `getSnapshot(): readonly ConversationSlashCommand[]` | 读取当前命令。 |
| `subscribe(listener)` | 订阅命令变化。 |
| `register(command): () => void` | 注册命令；返回的注销函数必须在调用方停用时执行。 |

调用方从 `@za38.03/agent-ui-plugins/composer-triggers` 导入 `CONVERSATION_COMMAND_SOURCE` 和 `ConversationCommandRegistry`，取得同一个注册器。只有提供方在服务初始化时调用 `createConversationCommandRegistry()`。

重复或空命令 ID 会报错；命令名称 `label` 来自项目文案，稳定 `id` 不随语言变化。

<span id="可以调整什么"></span>

<span id="怎么让-creator-修改"></span>

<span id="代码示例"></span>

<span id="命令注册"></span>

<span id="常见需求"></span>
