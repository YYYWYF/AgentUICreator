---
title: "当前技能标签（skills-selection）"
---

# 当前技能标签（skills-selection）

显示当前会话选中的技能，并允许移除。与 skills 使用同一个服务。移除时释放对应技能的 `setData` 数据，不单独生成参数；数据格式在 [skills](./skills#自定义发送数据) 的 `requestAdapter` 中配置。

## 常见需求

先按要实现的效果找到入口，再查看对应的代码示例和属性说明。

| 你想实现 | 属性或开发入口 | 示例 |
| --- | --- | --- |
| 在输入框上方显示当前技能 | `ConversationSkillSelection.selectedSkill`，或沿用插件服务绑定 | [查看代码](#example-1) |
| 暂时禁止移除当前选择 | `disabled` | [查看代码](#example-2) |
| 移除时同步其他插件 | `onRemove` → 现有 skills service.clear(threadId) | 见对应入口 |

## 代码示例

以下示例用于项目的插件应用入口。在现有组件上传入相同属性即可；`props` 表示该入口已有的属性。示例组件沿用现有 Agent 和会话上下文。

<span id="example-1"></span>

### 调整当前技能标签外观

selectedSkill 与 onRemove 继续使用原有服务绑定，标签只改变展示。

```tsx
import type { ComponentProps } from 'react';
import { ConversationSkillSelection } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationSkillSelection>) {
  return <ConversationSkillSelection {...props}
    style={{ ...props.style, maxWidth: 240 }} />;
}
```

<span id="example-2"></span>

### 禁用技能移除

业务处于不可修改的状态时，disabled 控制标签的移除操作。

```tsx
import type { ComponentProps } from 'react';
import { ConversationSkillSelection } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationSkillSelection>) {
  return <ConversationSkillSelection {...props}
    disabled={true} />;
}
```

## 开发 API

以下入口以当前源码的公开导出为准；实际项目请核对所安装版本。组件属性设置在项目 JSX 中，保留原有服务与 renderer 绑定。

### 公开入口与类型

**`@za38.03/agent-ui-plugins/skills-selection`**

- `default` / `skillsSelectionPlugin`：插件定义。
- `SkillsSelectionPlugin`：已绑定插件组件。

**`@za38.03/agent-ui-plugins`**

组件与组合部件：

- `ConversationSkillsSelection`。
- `ConversationSkillSelection`、`ConversationSkillSelectionProps`。

类型：

- `ConversationSkillsSelectionPluginProps`。

### 属性

- **绑定组件**：`ConversationSkillsSelection`。
- **属性类型**：`ConversationSkillsSelectionPluginProps`，继承 `div` 属性（含 `children`），公开 `disabled?: boolean`。
- **选择与移除**：从已有服务取得，不向该绑定组件传入 `selectedSkill` / `onRemove`。

`children` 虽在继承类型中，当前标签组件会用内置标签内容覆盖它；要改变内容结构，在调用方组合选择状态与自己的展示组件。

自定义其他插件的展示时可使用 `ConversationSkillSelection` 与 `ConversationSkillSelectionProps`：

| 属性 | 类型 | 默认行为 |
| --- | --- | --- |
| `selectedSkill?` | `ConversationSkill \| null` | 缺少时不渲染 |
| `onRemove?` | `() => void` | 点击移除时调用 |
| `disabled?` | `boolean` | 禁用移除按钮 |
| `className?` / `style?` | `string` / `CSSProperties` | 根容器样式，继承其他 `div` 属性 |

技能类型来自根入口，字段见 [skills 属性](./skills#属性)。

插件入口组件还接受 `renderSlot?`、`renderScopedSlot?`，用于已有 Runtime 的组合，继续转发即可；其签名和返回值见[组件与子插槽](/development/plugin-api#组件与子插槽)。原始展示组件是否接收它们，以本页列出的 Props 类型为准。

### Hook

没有独立 Hook，复用 [skills 的 useConversationSkillsState](./skills#hook)；读取和移除选择都操作同一份 `conversation.skills` 服务。

### 服务

- **提供**：无。
- **必需依赖**：`conversation.skills`。
- **可选依赖**：`agent-ui.locale`。

依赖 `conversation.skills`，不另行提供服务；方法与类型见 [skills](./skills#服务)。

### 其他插件如何调用

调用方在已有定义的 `inject` 中追加 `conversation.skills`，保留其他声明；只有允许缺失并处理降级时才使用 `optionalInject`。下例放在项目 `plugins/<调用方>/index.tsx`，服务必须与提供方位于同一 Agent 作用域。

```tsx
import {
  ConversationSkillSelection, CONVERSATION_SKILLS_SERVICE,
  usePluginService, useConversationSkillsState, type ConversationSkillsService,
} from '@za38.03/agent-ui-plugins';

export function SharedSkillChip() {
  const service = usePluginService<ConversationSkillsService>(CONVERSATION_SKILLS_SERVICE);
  const { selected, threadId, disabled } = useConversationSkillsState(service);
  return <ConversationSkillSelection selectedSkill={selected} disabled={disabled}
    onRemove={() => service?.clear(threadId)} />;
}
```
