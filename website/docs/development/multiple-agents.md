---
title: "多 Agent 与工作流入口"
---

# 多 Agent 与工作流入口

一个业务页面可以组合多个独立助手，也可以让同一个助手的多个工作流按钮调用不同 URL。本页按场景介绍对应的配置方式。

## 场景选择

| 场景 | 配置方式 |
| --- | --- |
| 后端多个 Agent 协作，统一输出 AG-UI | 前端挂载一个助手，连接统一 `endpoint` |
| 同一个助手有多个工作流按钮 | 各按钮分别设置 `endpoint` |
| 同页同时展示多个独立助手 | 一个 `AgentUIProvider` 下挂载多个 `AgentUIApplication` |
| 一个区域切换多个助手 | 业务组件控制各助手的 `hidden` |
| 不同页面各有自己的助手 | 每页独立挂载，各配 `endpoint` 和 `project` |
| PC 与移动端共用同一个后端 Agent | 按终端选择不同 `project`，使用同一个 `endpoint` |

这些场景都可以使用工作台、悬浮助手或嵌入式 UI。产品形态由各 `project` 绑定的 `Shell` 决定，见[模板说明](/start/#选择模板和源码位置)。同一工程可以维护多份 UI 配置。

## 后端统一编排多个 Agent

后端已经负责多个 Agent 的协作，并通过一个接口输出 AG-UI 时，前端连接这个统一入口即可：

```tsx
<AgentUIProvider>
  <AgentUIApplication
    agentId="assistant"
    endpoint="/api/agent/run"
    project={agentUIProject}
  />
</AgentUIProvider>
```

前端只需连接统一入口，无需按后端子 Agent 的数量配置多个助手。

## 同一助手的不同 URL

在项目现有 Composer 的应用层中组合按钮，不需要为每个工作流注册一个 Agent：

```tsx
import { ConversationComposerSend } from '@za38.03/agent-ui-plugins';

<>
  <ConversationComposerSend endpoint="/api/workflows/query-order">
    {messages.queryOrder}
  </ConversationComposerSend>
  <ConversationComposerSend endpoint="/api/workflows/refund">
    {messages.refund}
  </ConversationComposerSend>
  <ConversationComposerSend>{messages.send}</ConversationComposerSend>
</>
```

前两个按钮分别请求各自配置的 URL，最后一个按钮使用助手的默认 URL；Enter 也使用默认发送入口。

如需不同工作流连续使用同一段对话上下文，后端接口应共享相应的会话数据。

## 多助手与受控显示

`agentUIProject` 是项目应用层已有的配置。各助手可以共享 Plugin 定义和 AppUIModel，也可以使用各自的配置、模型和 Shell。

```tsx
import { useState } from 'react';
import { AgentUIProvider } from '@za38.03/agent-ui-runtime';
import { AgentUIApplication } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './application/project-config';

export function Assistants() {
  const [visible, setVisible] = useState('research');
  return (
    <AgentUIProvider>
      <button onClick={() => setVisible('research')}>研究助手</button>
      <button onClick={() => setVisible('writer')}>写作助手</button>
      <AgentUIApplication
        agentId="research"
        endpoint="/api/research/run"
        project={agentUIProject}
        hidden={visible !== 'research'}
      />
      <AgentUIApplication
        agentId="writer"
        endpoint="/api/writer/run"
        project={agentUIProject}
        hidden={visible !== 'writer'}
      />
    </AgentUIProvider>
  );
}
```

`hidden` 由业务组件控制，省略它即可同时展示多个助手。窗口展开收起由各自的 Shell 控制。示例按钮文案实际落地时使用项目 locale。

`agentId` 用于区分助手，`endpoint` 是该助手的默认请求 URL，`project` 决定它使用的 UI 配置。同一 URL 也可以用于多个助手。

## 不同页面各有自己的助手

以下两个组件分别交给业务工程已有的 `/customer` 和 `/report` 路由，不引入新的路由系统：

```tsx
import { AgentUIProvider } from '@za38.03/agent-ui-runtime';
import { AgentUIApplication } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './application/project-config';

export function CustomerPage() {
  return (
    <AgentUIProvider>
      <AgentUIApplication
        agentId="customer"
        endpoint="/api/customer/chat"
        project={agentUIProject}
      />
    </AgentUIProvider>
  );
}

export function ReportPage() {
  return (
    <AgentUIProvider>
      <AgentUIApplication
        agentId="report"
        endpoint="/api/report/chat"
        project={agentUIProject}
      />
    </AgentUIProvider>
  );
}
```

各页面的普通发送按钮直接发送给本页助手。两页可以共享布局配置，也可以分别传入不同的 `project`。

## PC 与移动端共用接口、使用不同 UI

同一个后端 Agent 可以同时服务 PC 和移动端。前端只挂载一个助手，根据终端选择不同的 UI 配置，`agentId` 和 `endpoint` 保持一致。

下面假设项目已经准备了 `PcShell`、`MobileShell` 两个外壳组件，并遵循 `AgentUIShellProps` 接口。`isMobile` 由业务页面提供。

```tsx
import { AgentUIProvider } from '@za38.03/agent-ui-runtime';
import { AgentUIApplication } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './application/project-config';
import { PcShell } from './ui/PcShell';
import { MobileShell } from './ui/MobileShell';

const pcProject = {
  ...agentUIProject,
  Shell: PcShell,
};

const mobileProject = {
  ...agentUIProject,
  Shell: MobileShell,
};

export function Assistant({ isMobile }: { isMobile: boolean }) {
  return (
    <AgentUIProvider>
      <AgentUIApplication
        agentId="assistant"
        endpoint="/api/agent"
        project={isMobile ? mobileProject : pcProject}
      />
    </AgentUIProvider>
  );
}
```

例如，PC 外壳可以提供侧栏和较大的操作区，移动端外壳可以提供全屏面板和紧凑操作区；两端发送都请求 `/api/agent`。这个例子通过 `Shell` 区分外壳与样式。内部 Plugin 布局也不同时，给 `pcProject`、`mobileProject` 分别设置各自的 `appUIModelSource`（AppUIModel 的 JSON 字符串），并保留布局所需的 Plugin 定义。

## Web Component 与 Creator

Vue/HTML Host 使用 React 生产的 Web Component，业务 Host 控制每项 `hidden`：

```js
element.config = {
  agents: [
    { agentId: 'research', endpoint: '/api/research/run', hidden: false },
    { agentId: 'writer', endpoint: '/api/writer/run', hidden: true },
  ],
};
```

更多参数见[Web Component 配置与事件](/development/web-component-api)。

Creator 可以修改上述项目配置、Shell 和发送按钮。开发时，在临时连接面板填写对应 `agentId`，即可为指定助手配置预览连接。
