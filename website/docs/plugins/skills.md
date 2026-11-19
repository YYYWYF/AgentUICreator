---
title: "技能选择（开发中）"
---

# 技能选择（开发中）

> **开发中**：技能相关文档仍在完善，接口说明和示例可能调整。

<figure className="plugin-preview">

<img src="/images/plugins/features/skills.png" alt="技能选择界面" width="672" height="103" />

<figcaption>选择一个技能后，当前技能预览插件显示标签。</figcaption>
</figure>

`skills` 在插件 `setup` 中提供 `conversation.skills` Service，保存当前技能选择。`skills` 插件提供选择栏；独立的 [`skills-selection`](./skills-selection) 插件显示当前技能标签，发送后由用户消息显示只读标签。两个 UI 插件通过该 Service 共享状态；Composer 只收集待发送的数据和来源。

需要完整技能输入 UI 时，在 Composer 的 `triggers` 中组合 `skills`，在 `beforeInput` 中组合 `skills-selection`，具体模型见[当前技能预览](./skills-selection#启用与使用)。两个插件均按需添加，初始化预设不会默认启用。

## 选择技能后再输入问题

项目通过 `items` 提供技能条目。默认前两项技能显示为快捷入口，其余条目从“更多”选择。技能的名称、说明来自项目统一文案层，`id` 是稳定业务标识。

<figure className="plugin-preview">

<img src="/images/plugins/features/skills-selection.png" alt="输入框内的当前技能标签" width="672" height="77" />

<figcaption>标签由 skills-selection 提供，点击移除只取消技能，保留正文、引用和附件。</figcaption>
</figure>

同一 Thread 一次只选择一个技能。接受发送后清空草稿选择；切换会话时清除原会话的待发送选择。已提交、排队或历史消息中的技能快照不会随之后的选择变化。

选择器和预览组件可以独立隐藏或卸载，状态由 Service 保留。停用整个 `skills` 插件时，Service 会清理选择与待发送数据，依赖它的 `skills-selection` 随之停用。

## 显示条件与数据来源 {#显示条件与数据来源}

技能来自项目的 `items` 或调用 Service 的 `select()`，不依赖后端消息事件。只读历史标签来自每条用户消息保存的技能元数据。

## 从业务卡片选择技能 {#从业务卡片选择技能}

在 `skills` 的项目应用层组合卡片，使用同一 Service 选择技能：

```tsx
import { useComposer, useConversationSkillsState, type ConversationSkillData } from '@za38.03/agent-ui-plugins';

export function SelectSkill({ skill }: { skill: ConversationSkillData }) {
  const composer = useComposer();
  const { service, threadId } = useConversationSkillsState();
  return <button type="button" onClick={() => service?.select(threadId, skill, composer)}>{skill.label}</button>;
}
```

Service 保存 `{ id, label }`，并调用 `composer.setData({ id, label })` 收集发送数据；无需传 `key`、发送开关或会话清理配置。取消选择调用 `service.clear(threadId)`，两个 UI 都从 `useConversationSkillsState().selected` 订阅选择。若卡片属于另一个独立插件，需在 definition 声明 `inject: ['conversation.skills']`，并在项目请求适配器中识别该插件的数据来源。

## 交给 Composer 的数据

<span id="自定义发送数据"></span>

默认生成的 `plugins/composer/request-adapter.ts` 通过 `sources[owner].pluginId` 识别 `skills` 的来源，再从 `pluginData[owner]` 读取技能快照，并将其放入 `forwardedProps.ctx.skill`，与 Host 已有 `ctx` 合并。例如：

```json
{
  "forwardedProps": {
    "ctx": {
      "tenantId": "t-1",
      "skill": { "id": "research", "label": "深度研究" }
    }
  }
}
```

未选择技能时不额外添加 `skill`。技能不会变成正文，也不会自动发送问题。普通 `setData` 仅收集数据；`sources` 自动记录插件 ID、实例 ID 和可选的用途名，实例 ID 改名不会破坏默认映射。npm Composer 不自动生成 `ctx.skill`；默认映射属于生成项目的应用代码，用户可以改名、改结构或删除。

## 改为后端约定的技能字段 {#选择技能后发送业务标识}

编辑项目生成的 `plugins/composer/request-adapter.ts`，或在 Composer 应用层替换最终 `requestAdapter`。下面把默认 `ctx.skill` 改为 `ctx.skillId`，保留其他业务字段：

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalComposer } from '@za38.03/agent-ui-plugins';
import { readConversationSkillData } from '@za38.03/agent-ui-plugins';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function ProjectComposer(props: ComponentProps<typeof ConversationCanonicalComposer>) {
  return <ConversationCanonicalComposer {...props} requestAdapter={({ request, pluginData, sources }) => {
    const forwarded = record(request.forwardedProps);
    const { skill: _skill, ...ctx } = record(forwarded.ctx);
    const owner = Object.keys(pluginData).find(owner => sources[owner]?.pluginId === 'skills');
    const skill = readConversationSkillData(owner === undefined ? undefined : pluginData[owner]);
    return { ...request, forwardedProps: { ...forwarded,
      ctx: { ...ctx, ...(skill ? { skillId: skill.id } : {}) },
    } };
  }} />;
}
```

适配器返回的请求是最终结果；不会再次补回默认字段。技能栏没有单独的请求适配器。调整发送格式不会改变本地消息保存的技能快照和标签展示。

## 发送后的消息与历史

发送时保存 `{ id, label }` 快照，消息标签只读，不影响下一次输入。默认请求的当前用户消息也带有 `metadata.skill`，供业务后端持久化。

历史由业务后端保存并返回，前端不代替后端持久化。使用 LangChain 历史格式时，返回 `additional_kwargs.metadata.skill`：

```json
{
  "type": "human",
  "id": "message-1",
  "content": "请帮我整理资料",
  "additional_kwargs": {
    "metadata": {
      "skill": { "id": "research", "label": "深度研究" }
    }
  }
}
```

官方转换器将其恢复到用户消息的 `metadata.custom.skill`。无需保存私有草稿状态即可显示历史标签，并在编辑重发、重试时沿用该条消息的技能。只保存正文无法恢复技能标签；`requestAdapter` 若删除或改写请求中的元数据，需相应调整业务保存与返回映射。接入步骤见[历史会话](/development/history-backend)。

## 调整快捷入口和标签

<span id="代码示例"></span>
<span id="example-1"></span>

### 调整快捷技能数量 {#调整快捷技能数量}

```tsx
import type { ComponentProps } from 'react';
import { ConversationSkillsBar } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationSkillsBar>) {
  return <ConversationSkillsBar {...props} quickItemCount={3} />;
}
```

### 自定义标签

在 `skills-selection` 的项目薄应用层定制当前技能预览，或通过 AppUIModel 停用该插件以隐藏预览。隐藏、停用或移除预览不会清除当前选择，也不改变发送数据；Composer 没有内置技能预览或专用 `skillPreview` 属性。用户消息默认显示只读标签。业务卡片需要额外展示时，可用 `useConversationSkillsState().selected` 读取 Service 中的选择，再传给公开展示组件 `ConversationSkillSelection`。`selectedSkill` 接受 `{ id, label }`；提供 `onRemove` 才显示移除按钮，`disabled` 控制该按钮。

<span id="启用与使用"></span>
<span id="需求示例"></span>
<span id="当前技能标签"></span>
<span id="与-composer-联动"></span>

## API

<span id="属性"></span>
<span id="开发-api"></span>

`ConversationSkillsBar` 使用 `ConversationSkillsPluginProps`，继承 `div` 属性并排除 `children`；选择状态由 `conversation.skills` Service 管理。

| 属性 | 类型 | 默认值与作用 |
| --- | --- | --- |
| `items?` | `readonly ConversationSkillItem[]` | 默认空数组，不生成业务技能 |
| `quickItemCount?` | `number` | 默认 `2`，其余条目从更多入口选择 |
| `disabled?` | `boolean` | 禁用条目交互 |
| `className?`、`style?` | 原生属性 | 调整整体样式 |

条目共有 `id`、`label`，可提供 `description`、`icon` 和 `disabled`。技能条目使用 `kind: 'skill'`。项目组件可自行组合业务按钮、卡片和其他交互，通过 Service 的 `select(threadId, value, composer)` 设置当前技能。

独立展示组件 `ConversationSkills` 另有 `selectedSkillId`、`defaultSelectedSkillId`、`onSelectedSkillChange` 和 `scopeKey`，用于由调用方控制的展示。`ConversationSkillsBar` 不接受这些受控属性。

<span id="hook"></span>
<span id="服务"></span>

| Service 与领域 API | 作用 |
| --- | --- |
| `CONVERSATION_SKILLS_SERVICE` | 服务标识 `conversation.skills`，由 `skills` 提供 |
| `useConversationSkillsState()` | 返回 `service`、当前 Thread 的 `selected`、`threadId` 和 `disabled` |
| `service.select(threadId, skill, composer)` | 保存技能并通过调用方的 Composer 收集数据 |
| `service.clear(threadId)` | 取消选择，同时释放待发送数据 |
| `service.getSnapshot(threadId)`、`service.subscribe(listener)` | 读取与订阅稳定快照 |
| `ConversationSkillData` | 只读 `id: string` 和 `label: string` |
| `readConversationSkillData(value)` | 将未知 JSON 收窄为技能数据；不是 Hook |

Service 随插件 setup 创建和销毁，并观察现有 canonical Thread 的切换、发送和重置。Composer 冻结每次提交的数据与来源，处理排队、编辑、重试和恢复；Runtime 不认识技能字段。
