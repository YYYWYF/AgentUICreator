---
title: "技能与工作流选择（skills）"
---

# 技能与工作流选择（skills）

<figure className="plugin-preview">

<img src="/images/plugins/features/skills.png" alt="技能与工作流界面" width="672" height="103" />

<figcaption>项目提供的技能快捷入口与更多选择；选择后用于当前问题，不立即发送。</figcaption>
</figure>

为本次问题选择一个技能，或显式启动项目工作流。技能栏、当前技能标签和 Composer 已共享选择状态；选中技能不会立即发送，也不需要用户再手动把技能写进草稿。

## 选择技能后再输入问题

项目通过 `items` 提供自己的技能；默认前两项作为快捷入口，其余通过更多入口选择。选中技能后，[当前技能标签](./skills-selection)显示这份选择，用户继续输入问题并正常发送。

同一 Thread 当前只保留一个技能选择。移除标签、切换会话、已接受普通发送，或当前技能被移除／禁用时，都会清除对应待发送选择。已提交或已排队请求的快照不受后来选择变化影响。只更新标签和说明不会重新提交一次业务选择。

<figure className="plugin-preview">

<img src="/images/plugins/features/skills-selection.png" alt="当前技能界面" width="672" height="77" />

<figcaption>选中的资料研究技能显示为当前技能标签，移除入口同步清除这份选择。</figcaption>
</figure>

## 交给 Composer 的数据

例如项目提供下列技能，文案来自项目 locale，`ctx` 是本次发送的默认业务参数：

```json
{ "kind": "skill", "id": "research", "label": "资料研究", "ctx": { "skillId": "research" } }
```

假设技能栏插件实例 ID 为 `skills`，未配置局部 `requestAdapter` 时，Composer 最终适配器读取到：

```json
{
  "pluginData": { "skills": { "skillId": "research" } },
  "selections": {
    "skills": [{ "kind": "skill", "id": "research", "label": "资料研究", "ctx": { "skillId": "research" } }]
  }
}
```

`pluginData.skills` 是技能 `ctx` 的**对象**，不是技能条目；`selections.skills` 是原始技能数组，保留 `kind/id/label` 与实际提供的 `description/disabled/ctx`，不保存 React `icon`。

默认请求将技能 `ctx` 浅合并到 `forwardedProps.ctx`。例如 Host 已提供租户 ID，本次请求的外带字段为：

```json
{ "forwardedProps": { "ctx": { "tenantId": "t-1", "skillId": "research" } } }
```

保留原有业务字段，技能字段覆盖同名字段；不额外生成 `forwardedProps.skills`。没有 `ctx` 时 `pluginData.skills` 为 `{}`，仍保留原始选择，但不自动增加后端参数。实例键以项目实际实例 ID 为准；嵌入其他插件中的技能入口使用其 `:skills` 子键。

## 改为后端约定的技能字段 {#选择技能后发送业务标识}

<span id="example-1"></span>

<span id="自定义发送数据"></span>

在项目已有技能入口上配置同步局部适配器，不改动选择、标签与移除逻辑：

```tsx
import type { ComponentProps } from 'react';
import { ConversationSkillsBar } from '@za38.03/agent-ui-plugins';

export function ProjectSkills(props: ComponentProps<typeof ConversationSkillsBar>) {
  return <ConversationSkillsBar {...props} requestAdapter={skill => ({ operation: skill.id })} />;
}
```

此时 `pluginData.skills` 为 `{ "operation": "research" }`，`selections.skills` 仍为原始技能数组，默认放入 `forwardedProps.skills`；不再自动合并该技能的 `ctx`。原有 Host 字段仍保留。

最终格式还可由 [Composer `requestAdapter`](./composer#请求适配)统一调整。局部回调抛错或返回非 JSON 时保留原选择和草稿，使用 `skills.selectionFailed` 显示错误。

## 技能选择与工作流启动 {#同时提供技能和工作流}

技能供下一次问题使用；工作流只在用户明确点击启动时调用项目提供的 `onStart`。启动工作流不会自动生成一个技能选择或 Composer 数据条目。工作流是否发送问题、使用哪个地址，由该项目操作决定。

```tsx
import { ConversationSkillsBar, useAgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const messages = {
  'zh-CN': { research: '资料研究', report: '生成报告' },
  'en-US': { research: 'Research', report: 'Generate report' },
};
export function Example({ startReport }: { startReport: () => Promise<void> }) {
  const labels = messages[useAgentUILocaleCode()];
  return <ConversationSkillsBar items={[
    { kind: 'skill', id: 'research', label: labels.research, ctx: { skillId: 'research' } },
    { kind: 'workflow', id: 'report', label: labels.report, onStart: startReport },
  ]} />;
}
```

## 共享技能选择 {#从业务卡片选择技能}

组件与服务位于同一 Agent，并声明 `conversation.skills` 依赖。

```tsx
import {
  CONVERSATION_SKILLS_SERVICE, usePluginService, useConversationSkillsState, useComposer,
  type ConversationSkillsService, type ConversationSkill,
} from '@za38.03/agent-ui-plugins';

export function SelectBusinessSkill({ skill }: { skill: ConversationSkill }) {
  const service = usePluginService<ConversationSkillsService>(CONVERSATION_SKILLS_SERVICE);
  const { threadId, disabled } = useConversationSkillsState(service);
  const composer = useComposer();
  return <button type="button" disabled={disabled || !service || skill.disabled}
    onClick={() => { service?.select(threadId, skill, composer); }}>
    {skill.label}
  </button>;
}
```

调用 `select()` 后，技能栏和标签跟随同一个服务更新；调用 `clear(threadId)` 只清除这份技能选择及它绑定的数据，不清空正文、附件或其他插件的数据。Composer 草稿订阅不会替代技能服务的选择订阅。

## 快捷技能数量 {#调整快捷技能数量}

前 3 项直接显示，其余条目使用原有更多选择入口；items 为空时不会自动生成业务技能。

```tsx
import type { ComponentProps } from 'react';
import { ConversationSkillsBar } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationSkillsBar>) {
  return <ConversationSkillsBar {...props}
    quickItemCount={3} />;
}
```

<span id="example-3"></span>

## API

<span id="属性"></span>
<span id="开发-api"></span>

`ConversationSkillsBar` 使用 `ConversationSkillsPluginProps`，继承 `div` 原生属性并排除 `children`；选择状态由服务管理。

| 属性 | 类型 | 默认行为 |
| --- | --- | --- |
| `items?` | `readonly ConversationSkillItem[]` | 默认空数组，无业务技能或工作流 |
| `requestAdapter?` | `(skill: ConversationSkillRequestItem) => ComposerData` | 同步定义选中技能的 JSON 数据；最终字段由 Composer 组装 |
| `quickItemCount?` | `number` | 默认 `2`，快捷展示项数 |
| `disabled?` | `boolean` | 默认 `false`，并叠加会话与服务可用性 |
| `className?` / `style?` | `string` / `CSSProperties` | 根容器样式 |

`ConversationSkillItem = ConversationSkill | ConversationWorkflow`。两种条目共有以下字段：

| 字段 | 类型 |
| --- | --- |
| `id` | `string` |
| `label` | `string` |
| `description?` | `string` |
| `icon?` | `ReactNode` |
| `disabled?` | `boolean` |

两类条目的区别：

- **技能 `ConversationSkill`**：`kind: 'skill'`；可提供 `ctx?: Readonly<Record<string, ComposerData>>`，用于声明默认业务参数；字段值须为 JSON。
- **工作流 `ConversationWorkflow`**：`kind: 'workflow'`；必须提供 `onStart(): void | Promise<void>`，只有显式点击启动时调用。

独立展示组件 `ConversationSkills` 使用 `ConversationSkillsProps`，还公开以下属性：

| 属性 | 类型 | 默认行为 |
| --- | --- | --- |
| `selectedSkillId?` | `string \| null` | 传入即受控；未传入时使用本地状态 |
| `defaultSelectedSkillId?` | `string \| null` | 默认 `null` |
| `onSelectedSkillChange?` | `(skill: ConversationSkill \| null) => void` | 选择或移除时通知 |
| `scopeKey?` | `string` | 变化时重置本地选择、弹层与等待状态 |

`ConversationSkillsBar` 不接受这四个受控属性；它通过现有服务绑定 Thread。项目条目的 `label` / `description` 由统一文案层提供，`id` 不随语言变化。

<span id="取数与联动"></span>

其他插件可读取当前选中的技能，或通过同一个 `conversation.skills` 服务选择、清除技能；技能栏和当前技能标签会跟随更新。选择需要传入当前输入区的写入绑定，见[调用示例](#从业务卡片选择技能)。其他联动入口见[插件联动与取数](/development/plugin-interaction)。

<span id="hook"></span>

`useConversationSkillsState(service)` 响应式订阅当前 Thread 的技能选择，返回：

- `selected`：当前技能。
- `threadId`：当前 Thread 标识。
- `disabled`：当前是否禁用。

`service` 可为 `undefined`，此时 `selected` 为 `null`。写入数据使用同一会话中的 `useComposer()`，无需操作原生运行配置。

### 服务方法 {#服务}

提供 `conversation.skills`。根入口公开 `CONVERSATION_SKILLS_SERVICE`、`createConversationSkillsService()`、`ConversationSkillsService`、`ConversationSkillComposerBinding`。

| 方法 | 用途 |
| --- | --- |
| `getSnapshot(threadId)` | 返回该 Thread 的 `ConversationSkill | null` |
| `subscribe(listener)` | 订阅选择变化，返回取消订阅函数 |
| `select(threadId, skill, composer, requestAdapter?)` | 绑定当前 Thread 的 `setData`，选择技能并保存 JSON 快照 |
| `clear(threadId)` | 清除该 Thread 的选择与本次选择的数据，不改写其他插件或原生业务配置 |
| `updatePresentation(threadId, skill)` | 只更新当前技能展示信息 |
| `dispose()` | 释放全部选择；由提供方清理生命周期调用 |

选择会在发送、切换会话或技能失效时清除；仅组件重挂载不会新建服务。普通调用方取得已有服务，不重复提供同一标识。

<details className="plugin-faq" id="为什么没有-selectedskillid-属性">
<summary>为什么没有 selectedSkillId 属性？</summary>

ConversationSkillsBar 通过会话服务管理选择。需要独立的受控展示时使用 ConversationSkills 的 selectedSkillId/onSelectedSkillChange；不要把独立组件属性传给服务绑定组件。

</details>

<span id="example-2"></span>

<span id="代码示例"></span>

<span id="常见需求"></span>

<span id="技能与工作流"></span>

<span id="技能与工作流条目"></span>
