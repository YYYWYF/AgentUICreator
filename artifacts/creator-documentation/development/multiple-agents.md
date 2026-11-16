# 多 Agent 与工作流入口

一个业务页面可以组合多个独立助手，也可以让同一个助手的多个工作流按钮调用不同 URL。本页按场景介绍对应的配置方式。

## 场景选择

| 场景                       | 配置方式                                            |
| ------------------------ | ----------------------------------------------- |
| 后端多个 Agent 协作，统一输出 AG-UI | 前端挂载一个助手，连接统一 `endpoint`                        |
| 同一个助手有多个工作流按钮            | 各按钮分别设置 `endpoint`                              |
| 同页同时展示多个独立助手             | 一个 `AgentUIProvider` 下挂载多个 `AgentUIApplication` |
| 一个区域切换多个助手               | 业务组件控制各助手的 `hidden`                             |
| 不同页面各有自己的助手              | 每页独立挂载，各配 `endpoint` 和 `project`                |
| PC 与移动端共用同一个后端 Agent     | 按终端选择不同 `project`，使用同一个 `endpoint`              |

这些场景都可以使用工作台、悬浮助手或嵌入式 UI。产品形态由各 `project` 绑定的 `Shell` 决定，见[模板说明](/start/index.md#选择模板和源码位置)。同一工程可以维护多份 UI 配置。

## 后端多 Agent 编排

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

## 同一助手的工作流入口

在项目现有 Composer 的应用层（`src/agent-ui/plugins/composer/index.tsx`）中组合按钮，不需要为每个工作流注册一个 Agent。下例是组件内的局部片段；`messages.queryOrder`、`refund`、`send` 由项目的[共享双语文案](/development/localization.md#新增业务文案)提供。

```tsx
import { ConversationComposerSend } from '@za38.03/agent-ui-plugins';

<>
  <ConversationComposerSend endpoint="/api/workflows/query-order"
    size="default" aria-label={messages.queryOrder}>
    {messages.queryOrder}
  </ConversationComposerSend>
  <ConversationComposerSend endpoint="/api/workflows/refund"
    size="default" aria-label={messages.refund}>
    {messages.refund}
  </ConversationComposerSend>
  <ConversationComposerSend>{messages.send}</ConversationComposerSend>
</>
```

前两个按钮分别请求各自配置的 URL，最后一个按钮使用助手的默认 URL；Enter 也使用默认发送入口。每个按钮发送当前输入框中的草稿、附件和引用，先输入内容才能发送。文字按钮显式设置 `aria-label`，让屏幕阅读器能区分工作流；`size="default"` 为文字预留空间。

如需不同工作流连续使用同一段对话上下文，后端接口应共享相应的会话数据。

## 多助手与受控显示

`agentUIProject` 是项目应用层已有的配置。各助手可以共享 Plugin 定义和 AppUIModel，也可以使用各自的配置、模型和 Shell。以下组件保存为 `src/Assistants.tsx`，再在 `src/App.tsx` 导入并渲染；假设生成目录为 `src/agent-ui/`。

```tsx
import { useState } from 'react';
import { AgentUIProvider } from '@za38.03/agent-ui-runtime';
import { AgentUIApplication } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './agent-ui/application/project-config';

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

## 从业务页面控制指定助手

多助手页面中，业务按钮放在外层 `AgentUIProvider` 内，与各个 `AgentUIApplication` 并列。使用 `useAgentUIAgents()` 按 `agentId` 取得目标助手，使用 `useAgentUIAgentsState()` 订阅状态。单助手的 `useAgentUI()` 读取最近一层 Host，不会自动选择当前可见的助手。

下面的组件可放入上方 `Assistants` 的 Provider 中。`labels` 由项目统一文案模块按当前语言提供，`onError` 接到业务页面已有的错误提示。

```tsx
import {
  useAgentUIAgents,
  useAgentUIAgentsState,
} from '@za38.03/agent-ui-runtime';

export function AssistantControls({ agentId, prompt, labels, onError }: {
  agentId: string;
  prompt: string;
  labels: { send: string; newConversation: string };
  onError: (error: unknown) => void;
}) {
  const agents = useAgentUIAgents();
  const ready = useAgentUIAgentsState(snapshot =>
    snapshot.agents.find(agent => agent.agentId === agentId)
      ?.connection.status === 'ready');
  async function send() {
    await agents.agent(agentId).sendMessage(prompt);
  }

  return <>
    <button disabled={!ready} onClick={() => {
      void send().catch(onError);
    }}>{labels.send}</button>
    <button disabled={!ready} onClick={() => {
      void agents.createThread(agentId).catch(onError);
    }}>{labels.newConversation}</button>
  </>;
}
```

`agents.agent(agentId).sendMessage(prompt, { endpoint: '/api/workflows/refund' })` 可为这一次发送指定工作流 URL，不创建 Thread。重试、前端工具续传和审批恢复沿用原请求入口。运行中的程序化发送仍可能报忙，应处理 Promise 失败；开启[消息排队](/development/message-queue.md)不会把它自动变成排队调用。

发送输入框中已有的草稿、附件与引用时，使用 `agents.agent(agentId).sendComposer()`；也可传 `{ endpoint }`。它使用当前 Thread 的原生 Composer，工作流发送在运行中会拒绝，不把草稿取出后另建消息链。调用前同样检查就绪状态，并处理失败。

### 助手集合接口

以下 Hooks 和类型从 `@za38.03/agent-ui-runtime` 导入。

| 接口                                                    | 用法                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `useAgentUIAgents()`                                  | 返回助手集合；必须在外层 `AgentUIProvider` 内。                                              |
| `useOptionalAgentUIAgents()`                          | 无集合 Provider 时返回 null，适用于可选接入。                                                 |
| `useAgentUIAgentsState(selector)`                     | 订阅集合快照；selector 返回已有字段或稳定值，不在其中每次创建新数组／对象。                                     |
| `useAgentUIAgentIdentity()`                           | 在指定助手内部读取 `{ agentId }`；助手外部返回 undefined，不用于选择助手。                              |
| `agents.agent(agentId)`                               | 取得这个已挂载助手的 `AgentUIHost`，不导航、不发送、不创建会话。                                        |
| `agents.createThread(agentId)`                        | 显式新建并切换该助手的会话，返回 `Promise<{ agentId, threadId }>`。                             |
| `agents.openThread({ agentId, threadId })`            | 打开这个助手的既有会话，返回 `Promise<void>`；历史读取需接好该助手的历史服务。                                |
| `agents.getSnapshot()` / `agents.subscribe(listener)` | 非 React 代码读取或监听集合；监听返回清理函数。快照的 `agents` 项含 `agentId`、`connection` 和 `threads`。 |

同一集合内 `agentId` 必须唯一、无首尾空白且长度不超过 100。两个助手即使后端返回相同 `threadId`，也必须用 `{ agentId, threadId }` 一起定位。每个助手有独立的可变运行组合与服务；共享 UI 配置不等于共享运行。

这些操作不会替业务页面修改 `hidden`。例如打开研究助手的历史后，若需要同时显示它，业务页面还需把自己的 `visible` 改为 `research`。保持 `agentId` 和默认 `endpoint` 稳定；更换它们会重建该应用的会话边界，不用于切换工作流。

## 观察和控制后台 Thread

同一个助手新建或打开另一个会话后，原 Thread 可以继续在后台运行。以下操作需要区分当前会话与指定 Thread：

| 操作                                                    | 对象与行为                                                 |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `host.getSnapshot()` / `host.abortRun()`              | 读取／停止该助手**当前选中的会话**。                                  |
| `host.getThreads()`                                   | 读取该助手当前已挂载的 Thread 快照，包含后台运行；不是后端全部历史列表。              |
| `host.subscribeThreads(listener)`                     | 监听已挂载 Thread 的变化，回调中重新读取；返回取消监听函数。                    |
| `host.thread(threadId)`                               | 取得某个已挂载 Thread 的句柄；不会把界面切过去，也不会自动加载未挂载的历史。            |
| `thread.getSnapshot()` / `thread.subscribe(listener)` | 读取／订阅该 Thread 的消息、运行状态与中断；监听返回清理函数。                   |
| `thread.abortRun()`                                   | 停止这个 Thread 的运行，不影响其他 Thread 或当前显示选择。                 |
| `thread.resumeInterrupts(responses)`                  | 提交这个 Thread 的审批或补充信息，返回 Promise；不得误发给当前显示的另一个 Thread。 |
| `thread.sendMessage(input, options?)`                 | 向这个 Thread 发送消息，返回 Promise；运行中仍按单次发送规则处理。             |
| `thread.subscribeApplicationEvents(listener)`         | 订阅这个 Thread 的实时业务事件，返回清理函数。                           |

例如做后台任务列表时，下面的 Hook 读取指定助手的所有已挂载 Thread。返回的是快照中的已有数组，界面可以按 `thread.run.status` 显示本地化状态，并使用 `thread.conversation.id` 作为 Thread 标识。

```tsx
import { useAgentUIAgentsState } from '@za38.03/agent-ui-runtime';

export function useMountedThreads(agentId: string) {
  return useAgentUIAgentsState(snapshot =>
    snapshot.agents.find(agent => agent.agentId === agentId)?.threads);
}
```

停止后台任务时，在点击处理函数中重新获取 `agents.agent(agentId).thread(threadId)`，再调用 `abortRun()`，并捕获同步错误。查看任务时调用 `agents.openThread({ agentId, threadId })`，并捕获 Promise 失败。订阅单个 Thread 的状态或事件时，在 `useEffect` 的清理函数中取消订阅；切换 `agentId`／`threadId` 后重新绑定。

历史服务中的会话可能尚未挂载，先通过 `openThread()` 打开，不能用 `thread()` 当作历史查询接口。Thread 的消息、队列、分支和生命周期仍由现有 Conversation Runtime 管理。

### 隐藏、切换与卸载

| 动作                                 | 生命周期                           |
| ---------------------------------- | ------------------------------ |
| 修改 `hidden`，或收起保留 children 的 Shell | 助手和服务保持挂载，后台运行继续。              |
| 显式新建会话                             | 创建新 Thread 并切换到它；原来已挂载的运行可以继续。 |
| 打开历史会话                             | 导航到指定 Thread，不通过重新发送旧问题来恢复。    |
| 条件渲染移除助手、更换身份、离开页面或刷新              | 不能保持当前页面的运行生命周期。               |

不要用 `{visible === 'research' && <AgentUIApplication ... />}` 切换需后台运行的助手，也不要把多个助手放进只渲染当前项的 `stack`。保留各实例，通过 `hidden` 控制可见性。

`AGENT_UI_AGENT_NOT_FOUND` 表示目标助手未挂载或已移除；`AGENT_UI_THREAD_NOT_FOUND` 表示目标 Thread 当前未挂载；`AGENT_UI_NOT_READY` 表示当前操作所需的连接尚不可用。卸载或重建期间，未完成的操作还可能收到 `AGENT_UI_SESSION_ENDED`。更新页面状态后重新读取目标，不能自动回退成新会话。

### 验证

为两个助手分别发送慢速请求，隐藏其中一个后确认仍有输出；再显式新建会话，确认原 Thread 仍在 `getThreads()` 中运行。分别停止一个后台 Thread、打开其历史和处理其审批，检查其他助手与 Thread 不受影响。工作流切换应保持 `threadId`，显式新建才产生新身份。

## 业务页面独立助手

以下两个组件分别交给业务工程已有的 `/customer` 和 `/report` 路由，不引入新的路由系统：

```tsx
import { AgentUIProvider } from '@za38.03/agent-ui-runtime';
import { AgentUIApplication } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './agent-ui/application/project-config';

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

## 跨端接口复用与界面适配

同一个后端 Agent 可以同时服务 PC 和移动端。前端只挂载一个助手，根据终端选择不同的 UI 配置，`agentId` 和 `endpoint` 保持一致。

下面假设项目已经准备了 `PcShell`、`MobileShell` 两个外壳组件，并遵循 `AgentUIShellProps` 接口。`isMobile` 由业务页面提供。

```tsx
import { AgentUIProvider } from '@za38.03/agent-ui-runtime';
import { AgentUIApplication } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './agent-ui/application/project-config';
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

更多参数见[Web Component API](/development/web-component-api.md)。

Creator 可以修改上述项目配置、Shell 和发送按钮。开发时，在临时连接面板填写对应 `agentId`，即可为指定助手配置预览连接。
