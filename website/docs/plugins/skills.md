---
title: "技能与工作流选择（skills）"
---

# 技能与工作流选择（skills）

在当前会话中选择技能，或通过显式点击启动项目提供的工作流。插件只负责前端选择与调用项目回调，不编排后端 Agent。

## 常见需求

先按要实现的效果找到入口，再查看对应的代码示例和属性说明。

| 你想实现 | 属性或开发入口 | 示例 |
| --- | --- | --- |
| 增加可选择技能 | `items` 中的 kind="skill" 条目 | [查看代码](#example-3) |
| 选择后发送指定业务 JSON | `requestAdapter` | [查看代码](#example-1) |
| 控制快捷展示数量 | `quickItemCount` | [查看代码](#example-2) |
| 点击后执行工作流 | `items` 中 kind="workflow" 与 `onStart` | [查看代码](#example-3) |
| 显示当前选择的标签 | [当前技能标签](./skills-selection)，共享同一个 skills 服务 | 见对应入口 |

## 取数与联动

其他插件可读取当前选中的技能，或通过同一个 `conversation.skills` 服务选择、清除技能；技能栏和当前技能标签会跟随更新。选择需要传入当前输入区的写入绑定，见下方[调用示例](#其他插件如何调用)。其他联动入口见[插件联动与取数](/development/plugin-interaction)。

## 代码示例

以下示例用于项目的插件应用入口。在现有组件上传入相同属性即可；`props` 表示该入口已有的属性。示例组件沿用现有 Agent 和会话上下文。

<span id="example-1"></span>

### 选择技能后发送业务标识

items 继续来自项目双语配置。适配器将本次选择保存为 JSON，最终请求由 Composer 组装。

```tsx
import type { ComponentProps } from 'react';
import { ConversationSkillsBar } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationSkillsBar>) {
  return <ConversationSkillsBar {...props}
    requestAdapter={skill => ({ skillId: skill.id })} />;
}
```

<span id="example-2"></span>

### 调整快捷技能数量

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

### 同时提供技能和工作流

技能选中后供下一次发送使用；工作流只在用户显式点击启动时调用 onStart。onStart 由项目提供，示例不定义后端执行流程。业务标签从共享双语表读取。

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

## 开发 API

以下入口以当前源码的公开导出为准；实际项目请核对所安装版本。组件属性设置在项目 JSX 中，保留原有服务与 renderer 绑定。

### 公开入口与类型

**`@za38.03/agent-ui-plugins/skills`**

- `default` / `skillsPlugin`：插件定义。
- `SkillsPlugin`：已绑定插件组件。

**`@za38.03/agent-ui-plugins`**

组件与组合部件：

- `ConversationSkillsBar`。
- `ConversationSkills`、`ConversationSkillsProps`。

Hook：

- `useConversationSkillsState`。

工厂与辅助函数：

- `createConversationSkillsService`。

服务标识与常量：

- `CONVERSATION_SKILLS_SERVICE`。

类型：

- `ConversationSkillsPluginProps`、`ConversationSkillItem`。
- `ConversationSkill`、`ConversationWorkflow`。
- `ConversationSkillsService`、`ConversationSkillComposerBinding`。
- `ConversationSkillRequestItem`、`ConversationSkillRequestAdapter`。

### 属性

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

插件入口组件还接受 `renderSlot?`、`renderScopedSlot?`，用于已有 Runtime 的组合，继续转发即可；其签名和返回值见[组件与子插槽](/development/plugin-api#组件与子插槽)。原始展示组件是否接收它们，以本页列出的 Props 类型为准。

### Hook

`useConversationSkillsState(service)` 响应式订阅当前 Thread 的技能选择，返回：

- `selected`：当前技能。
- `threadId`：当前 Thread 标识。
- `disabled`：当前是否禁用。

`service` 可为 `undefined`，此时 `selected` 为 `null`。写入数据使用同一会话中的 `useComposer()`，无需操作原生运行配置。

### 服务

- **提供**：`conversation.skills`。
- **必需依赖**：无。
- **可选依赖**：`agent-ui.locale`。

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

### 其他插件如何调用

调用方在已有定义的 `inject` 中追加 `conversation.skills`，保留其他声明；只有允许缺失并处理降级时才使用 `optionalInject`。下例放在项目 `plugins/<调用方>/index.tsx`，服务必须与提供方位于同一 Agent 作用域。

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

## 自定义发送数据

在项目已有的 `plugins/skills/index.tsx` 组件调用处配置，无需接管源码：

```tsx
<Implementation {...props} items={items}
  requestAdapter={skill => ({ operation: skill.id })} />
```

`requestAdapter` 在选择时同步执行：

- **输入**：`kind/id/label/description/disabled/ctx`，不含 React `icon`；可选字段按实际条目提供。
- **返回**：任意 JSON 值，由插件通过 `useComposer().setData` 保存。
- **最终组装时读取**：`pluginData[技能插件实例ID]` 为返回值，`selections[同一ID]` 为原始选择数组。

省略回调时，`skill.ctx` 的字段合并到 `forwardedProps.ctx`，保留已有业务字段，技能字段覆盖同名字段。插件不会把业务字段写回原生 Composer 配置。没有配置 `ctx` 的技能不自动生成后端参数；原始选择仍可由 Composer 读取。

```tsx
<SkillsPlugin items={[{ kind: 'skill', id: 'research', label: messages.research, ctx: { skillId: 'research' } }]} />
```

选择该技能后发送，默认携带 `forwardedProps: { ctx: { skillId: "research" } }`；已有 Host `ctx` 字段也会保留。

配置回调后，默认外带字段为 `forwardedProps[技能插件实例ID]`，不再自动附加该技能的默认运行字段。Composer 的最终 `requestAdapter` 可以重新命名、合并、写入正文或完全移除这些数据，见[统一组装](./composer#请求适配)。

移除技能或切换会话会释放它自己的数据；提交快照不受后续选择修改影响。回调抛错或返回非 JSON 时保留原选择和草稿，并使用 `skills.selectionFailed` 显示错误。工作流仍只执行显式 `onStart`，不自动发送数据。

## 常见问题

### 为什么没有 selectedSkillId 属性？

ConversationSkillsBar 通过会话服务管理选择。需要独立的受控展示时使用 ConversationSkills 的 selectedSkillId/onSelectedSkillChange；不要把独立组件属性传给服务绑定组件。
