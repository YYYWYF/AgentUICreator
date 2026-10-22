---
title: 插件开发
---

# 插件开发

插件是项目中的 React 组件。项目为它提供 Agent 状态、运行操作、事件和共享服务；开发者在这些能力上编写自己的界面与业务交互。

如果只是配置语言、用户资料、附件或历史接入，先看[Agent 参数与配置](../integration/agent-options)。本页介绍开发界面插件时如何使用项目已有能力。

下面用几个独立的小例子介绍常用能力。示例放在已有插件中使用，无需一次接入全部能力；完整字段按需查阅[插件定义参考](./plugin-contract)。

## 文件结构与修改位置

插件目录位于项目配置的 Agent UI 源码目录下。以输入框插件为例：

```text
plugins/composer/
├── index.tsx          界面、属性、事件与组件组合
├── definition.ts      注册组件、服务和生命周期
├── manifest.json      插件身份、能力与子 Slot 声明
└── application.json   项目应用层标识
```

通常先修改 `index.tsx`。调整插件位置、尺寸、启停或子插件顺序，修改 `app-ui/app-ui.json`；新增服务或渲染注册，再修改 `definition.ts`。生成的 `plugins/registry.generated.ts` 通过工程既有流程刷新。

默认的 `index.tsx` 引用官方 npm 组件，可直接传入公开属性、组合 children 或替换 renderer。确实需要修改内部实现时，再按[源码接管](../customization/source-takeover)流程处理。接管后会增加 `source/`，例如输入框的 `source/adapters/composer.tsx` 和 `textarea.tsx`。项目入口仍保留原有业务配置，上游来源文件保持原样。

下文相对导入均以 `plugins/<id>/` 为起点。Windows 使用相同目录层级；源码根目录以项目配置为准。

## 读取状态、控制运行

例如，开发一个停止按钮：读取当前运行状态，运行中允许点击，通过项目提供的操作停止 Agent。

```tsx
import { useAgentRun, usePluginActions } from '../../runtime/context';

export function StopButton({ label }: { label: string }) {
  const run = useAgentRun();
  const { abortRun } = usePluginActions();

  return (
    <button disabled={run.status !== 'running'} onClick={abortRun}>
      {label}
    </button>
  );
}
```

将组件接到已有插件入口，`label` 从项目语言配置传入。组件位于现有插件和 Agent Provider 内，不需要创建新连接。

相同方式还可以使用：

| 需求 | 入口 |
| --- | --- |
| 读取消息、业务状态 | `useAgentMessages()`、`useAgentState<T>()` |
| 读取工具执行、待处理问题 | `useAgentExecutions()`、`useAgentInterrupts()` |
| 发送内容、新建会话 | `usePluginActions()` 的 `sendMessage(input)`、`startNewConversation()` |
| 提交问题答复或恢复运行 | `usePluginActions()` 的 `resumeInterrupts(responses)` |

异步操作要处理失败。共享状态由 Agent 发布；需要修改业务状态时，通过约定的业务动作处理，不直接修改读取到的快照。更多说明见[共享状态与事件](../customization/state-and-events)。

## 使用项目服务

项目服务提供可复用的业务能力。例如，历史服务已经提供会话列表，开发者可以直接订阅它，显示会话数量：

```tsx
import { usePluginService, usePluginServiceSnapshot } from '../../runtime/plugins';
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type ConversationService,
} from '../../services/conversations';

export function HistoryCount({ label }: { label: string }) {
  const service = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const snapshot = usePluginServiceSnapshot(service, EMPTY_CONVERSATION_SNAPSHOT);
  return <output aria-label={label}>{snapshot.conversations.length}</output>;
}
```

在该插件 `definition.ts` 的 `optionalInject` 中加入 `AGENT_UI_CONVERSATION_SERVICE`。有服务时显示实际数量，没有服务时使用空快照。

开发自己的共享能力时，在 `services/` 定义接口，再由提供者注册：

- `provides`：声明提供哪些服务，在 `setup` 中通过 `services.provide` 注册。
- `inject`：声明必需服务，服务就绪后再激活插件。
- `optionalInject`：声明可选服务，缺少时由组件提供降级显示。

`setup` 返回的清理函数用于取消业务订阅、任务和计时器。它不是 React 组件，不能调用 hooks。服务的完整合同见[可观察服务](./plugin-contract#可观察服务与组件消费)。

## 响应 Agent 的业务事件

例如，Agent 发布 `app.resource.selected`，插件收到后通知页面选中对应资源。

先在应用的 `agent-contract/agent-events.ts` 中为已有 `appEventSchemas` 增加一项：

```ts
import { z } from 'zod';

export const appEventSchemas = {
  'app.resource.selected': z.object({ resourceId: z.string() }),
};
```

保留原有事件声明。在插件 manifest 的 `data.events` 中加入 `app.resource.selected`，然后在组件中订阅：

```tsx
import { useEffect } from 'react';
import { usePluginEvents } from '../../runtime/context';

export function ResourceObserver({ onSelect }: { onSelect: (id: string) => void }) {
  const events = usePluginEvents();

  useEffect(() => events.subscribe<{ resourceId: string }>(
    'app.resource.selected',
    event => onSelect(event.payload.resourceId),
  ), [events, onSelect]);

  return null;
}
```

该组件从插件入口渲染，`onSelect` 连接项目现有的资源选择逻辑。应用负责校验事件数据，组件卸载时会取消这里的订阅。持续变化的数据使用状态或服务，事件用于单次通知。

## 将结构化数据渲染成组件

例如，后端发送名为 `app.metric` 的数据消息，内容为 `{ "value": 42 }`。插件可以注册一个显示数值的组件：

```tsx
import { z } from 'zod';
import { defineDataMessageUI } from '@za38.03/agent-ui-plugins';

const metricSchema = z.object({ value: z.number() });

export const metricUI = defineDataMessageUI<unknown>({
  name: 'app.metric',
  render: ({ data }) => {
    const result = metricSchema.safeParse(data);
    return result.success ? <output>{result.data.value}</output> : null;
  },
});
```

在 `definition.ts` 中加入 `dataMessageUIs: [metricUI]`，manifest 的 `data.messageUI` 设为 `true`，并将该插件实例加入组合。只注册数据展示时，`Component` 可以返回 `null`。

示例对无效数据不显示内容，产品中也可提供统一语言的错误提示。数据消息名称要与后端一致；注册 renderer 不会自动生成业务数据。工具结果使用 `toolkit` 注册，详见[工具与数据消息展示](../customization/custom-renderers)。

## 组合子插件

插件可以为其他插件留出语义位置。例如，声明一个 `content` 子 Slot 后，在组件中输出它：

```tsx
import type { UIPluginComponentProps } from '../../framework/contracts/ui-plugin';

export function ProjectPanel({ renderSlot }: UIPluginComponentProps) {
  return <section>{renderSlot('content', null)}</section>;
}
```

在 manifest 的 `slots.children.content` 中声明说明和 `cardinality`，再通过 AppUIModel 的实例 `slots.content` 放入子插件。需要限制种类时配置接受的 capability。

普通区域使用 `renderSlot`。工具、消息或整轮回复等需要当前实体数据的位置使用 `renderScopedSlot`，沿用已有作用域。位置与组合修改见[布局教程](../customization/layout-and-composition)。

## 其他能力按需接入

| 需要的功能 | 使用方式与说明 |
| --- | --- |
| 自定义工具卡片、审批和补充信息 | 复用公开 renderer 与当前调用上下文；问题答复通过现有中断恢复接口提交。见[工具展示](../customization/custom-renderers)和[审批与问题](../agent-ui/approval-and-questions)。 |
| 让 Agent 操作页面或表单 | 插件提供业务服务，应用单独注册允许的前端工具。显示工具 UI 不会授予执行权限。见[前端工具](../integration/frontend-tools)。 |
| 附件、语音与反馈 | 复用对应插件，在应用接入上传、识别和反馈适配器。见[业务适配器](../integration/attachments-dictation-feedback)。 |
| @ 提及、/ 命令、标签式编辑 | 提供搜索或命令服务，按需使用 Lexical 输入。见[提及与命令](../customization/mention-and-commands)。 |
| 历史会话与恢复 | 使用已有会话服务和线程绑定；继续运行需要后端支持。见[历史接入](../integration/history-backend)。 |
| 临时通知 | 使用 `useConversationTransientMessages().addMessage`，提示留在当前页面，不进入持久历史。见[临时通知插件](./transient-assistant-messages)。 |
| 语言、主题、账号与应用进入条件 | 复用项目共享服务，文案保持中英文对应。见[语言](../customization/localization)、[主题](../customization/themes)和[登录插件](./auth-gate)。 |
| 按 JSON 动态展示组件 | 显式配置组件词表和动作。见[可选 Generative UI](../customization/generative-ui)。 |
| 侧栏快捷入口、错误诊断与测试 | 定义 `RailAction`，使用项目已有诊断与 Mock。见[定义参考](./plugin-contract)和[验证定制](../customization/test-customizations)。 |

复杂功能可以由几个小插件通过服务和子 Slot 协作。已有 Runtime、语言和主题继续复用；业务接口由项目提供。

## 修改后验证

运行目标项目已有的 `typecheck`、`test` 和 `build`，再检查实际页面的正常、失败、取消和卸载行为。新增定义后按工程约定刷新注册表，使用 Creator 时可通过现有 `/sync` 流程同步。

官方包升级保留项目应用文件与已接管实现。需要采用新版本地实现时，通过[源码更新](../updates/source-sync)比较、合并和验证。

> 截图待补：插件文件目录及代码位置；停止按钮、历史数量、事件联动和数据卡片各自的效果图。

进一步阅读：[创建自定义插件](./create-plugin) · [应用层定制](../customization/application-layer) · [插件定义参考](./plugin-contract)
