# 当前技能标签（skills-selection）

<figure className="plugin-preview">

<img src="/images/plugins/features/skills-selection.png" alt="当前技能界面" width="672" height="77" />

<figcaption>资料研究技能已选中；点击移除会同步清除当前技能与待发送参数。</figcaption>
</figure>

显示当前 Thread 已选技能，并提供移除入口。技能来自[技能栏](/plugins/skills.md)，标签自动订阅同一份服务；未选择技能时不显示，不需要调用方自己维护第二份选中状态。

## 与 Composer 联动

这个插件不向 `pluginData` 或 `selections` 再写一份数据。数据属于发起选择的技能入口，完整格式见[技能交给 Composer 的数据](/plugins/skills.md#交给-composer-的数据)。

需要改变整体请求结构时，仍由 [Composer 最终适配器](/plugins/composer.md#请求适配)处理。

点击移除会调用当前 Thread 的技能服务清理，下一次发送便不再携带该技能参数；正文、附件及其他插件选择保留。已提交快照不受移除影响。技能栏选中别的技能时标签同步更新；发送、切换会话或技能失效后的清理同样由共享服务处理。

## 在业务卡片中显示同一份选择 \{#在其他卡片显示并移除技能}

下面是独立展示组件的接法：既订阅当前选择，也把移除交回同一服务。组件与服务位于同一 Agent，并声明 `conversation.skills` 依赖。

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

业务卡片只需要读选择时，直接使用 `useConversationSkillsState(service)` 的 `selected`；不调用 `setData()`，也不重复创建技能服务。完整选择与清理方法见 [skills 服务](/plugins/skills.md#服务)。

## 调整当前技能标签外观 \{#调整当前技能标签外观}

<span id="example-1"></span>

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

## 禁用技能移除 \{#禁用技能移除}

业务处于不可修改的状态时，disabled 控制标签的移除操作。

```tsx
import type { ComponentProps } from 'react';
import { ConversationSkillSelection } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationSkillSelection>) {
  return <ConversationSkillSelection {...props}
    disabled={true} />;
}
```

`disabled` 禁止用户移除，不会清除已选技能或把它从请求中排除。要取消技能对本次发送的影响，使用同一个服务的 `clear(threadId)`。

## API

<span id="属性"></span>
<span id="开发-api"></span>

`ConversationSkillsSelection` 从已有服务读取选择并处理移除，`disabled?: boolean` 用于禁止移除；它继承 `div` 属性。需要自己提供选择和回调时，使用下表中的 `ConversationSkillSelection`。

插件不接受 `children`。需要完全不同的标签结构时，在项目组件中读取选择状态并组合自己的展示。

自定义其他插件的展示时可使用 `ConversationSkillSelection` 与 `ConversationSkillSelectionProps`：

| 属性                      | 类型                          | 默认行为                |
| ----------------------- | --------------------------- | ------------------- |
| `selectedSkill?`        | `ConversationSkill \| null` | 缺少时不渲染              |
| `onRemove?`             | `() => void`                | 点击移除时调用             |
| `disabled?`             | `boolean`                   | 禁用移除按钮              |
| `className?` / `style?` | `string` / `CSSProperties`  | 根容器样式，继承其他 `div` 属性 |

技能类型来自根入口，字段见 [skills 属性](/plugins/skills.md#属性)。

<span id="hook"></span>

业务卡片和技能栏要显示同一份选择时，通过 [skills 的 `useConversationSkillsState(service)`](/plugins/skills.md#hook) 订阅当前 Thread，使用返回的 `selected` 显示标签、`threadId` 清除对应选择、`disabled` 控制移除入口。[技能标签与移除](#在其他卡片显示并移除技能)同时保留这三项绑定。

### 服务方法 \{#服务}

依赖 `conversation.skills`，不另行提供服务；方法与类型见 [skills](/plugins/skills.md#服务)。

<span id="代码示例"></span>

<span id="常见需求"></span>

<span id="当前技能"></span>

<span id="技能标签与移除"></span>
