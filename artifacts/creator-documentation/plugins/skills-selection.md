# 当前技能预览（开发中）

`skills-selection` 在输入框内显示当前技能和移除按钮。它与[技能选择器](/plugins/skills.md)是两个独立的 UI 插件，通过 `conversation.skills` Service 共享选择状态。

<figure className="plugin-preview">

<img src="/images/plugins/features/skills-selection.png" alt="输入框内的当前技能标签" width="672" height="77" />

<figcaption>点击移除取消技能，保留正文、引用和附件。</figcaption>
</figure>

## 显示条件与数据来源 \{#显示条件与数据来源}

数据来自 `useConversationSkillsState().selected`，不依赖后端事件。当前 Thread 有技能选择时显示标签；没有选择时不占用内容空间。运行状态及项目的 `disabled` 控制移除按钮。

该插件声明 `inject: ['conversation.skills']`，依赖 `skills` 在 setup 中提供的服务。它只负责读取选择和调用 Service 取消选择，不从 Composer 读取 UI 状态。

## 在输入框中显示当前技能

<span id="启用与使用"></span>

需要选择器和预览时，在现有 Composer 实例中组合两个插件：

```json
{
  "id": "composer-main",
  "pluginId": "composer",
  "slots": {
    "triggers": [
      { "id": "skills-main", "pluginId": "skills" }
    ],
    "beforeInput": [
      { "id": "skills-preview", "pluginId": "skills-selection" }
    ]
  }
}
```

这是 AppUIModel 的局部片段；保留现有实例、引用插件和其他子插槽。通过正常的插件应用层生成流程添加两个本地 definition，不直接覆盖已有模型。两个插件均为按需启用，不默认加入初始化预设。

隐藏、停用或移除预览只影响展示，当前技能仍可发送。隐藏或卸载选择器组件不会清空已有选择；停用整个 `skills` 插件会销毁 Service，预览也随依赖失效停用。点击移除按钮调用 `service.clear(threadId)`。发送、排队、重试和历史恢复由现有 Composer 数据能力处理，用户消息中的只读技能标签不依赖此输入区插件。

## 定制预览 \{#代码示例}

在 `plugins/skills-selection/index.tsx` 中向已有实现传 props：

```tsx
import { SkillsSelectionPlugin as Implementation } from '@za38.03/agent-ui-plugins/skills-selection';
import type { ComponentProps } from 'react';

export function SkillsSelectionPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} className="project-skill-preview" />;
}
```

可通过公开组件 `ConversationSkillsSelection` 组合默认预览；完全替换展示时，使用 `useConversationSkillsState()` 读取 `selected` 并调用 `service.clear(threadId)`，保持同一份 Service 状态。组件和样式调整先在项目应用层完成；确需修改内部实现时，仅接管 `skills-selection`。

## 从内置预览迁移

此前依赖 Composer 自动显示技能的项目，需要显式添加 `skills-selection`。原来使用 Composer `skillPreview` 的定制移到这个插件的应用层，或组合进通用 `beforeInput` 内容。npm 升级不会自动改写 AppUIModel、项目应用层、已接管源码或 BASE。

既有技能 UI 状态读取与取消操作需迁移到 `conversation.skills` Service。Composer 不提供专用 `setSkill`，也不提供具名共享数据键。既有 Composer 应用层还需显式接入本地 `request-adapter.ts`；包升级不会自动覆盖项目代码。

## API

<span id="属性"></span>

`ConversationSkillsSelection` 使用 `ConversationSkillsSelectionPluginProps`：

| 属性                    | 类型        | 作用           |
| --------------------- | --------- | ------------ |
| `disabled?`           | `boolean` | 禁用移除按钮，不清空技能 |
| `className?`、`style?` | 原生属性      | 调整预览根元素      |

其余非 `children` 的 `div` 属性透传。`selectedSkill` 和 `onRemove` 由绑定组件管理；独立展示组件 `ConversationSkillSelection` 额外提供这两个属性。
