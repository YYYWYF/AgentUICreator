# 业务页面与 Agent 联动

## 接入位置

从 `@za38.03/agent-ui-runtime` 导入 `AgentUIProvider`，包住业务按钮和项目导出的 `<Agent />`；按钮内通过 `useAgentUI()` 操作会话。服务地址、主题与适配器仍传给 Agent，完整字段见[属性表](/development/react-host-api.md#agent-属性表)。

面板开关由 React 状态控制；用 `hidden` 或 CSS 隐藏并保持 Agent 挂载，可保留会话。卸载 Agent 或 Provider 会结束会话。Provider 没有 `open()` / `close()` 方法，也不会自行启动会话；操作前需挂载 Agent 并等待就绪。

## 示例：在编辑页面打开助理

下面是仓库中 `examples/creator-embedded-host` 的实际运行截图，使用官方嵌入式模板、violet 主题和本地 Mock 服务。业务按钮位于页面右上角，助理显示在编辑区右侧。

**1. 收起助理。** 右侧面板隐藏，编辑区扩展；右上角仍保留“打开助理”和“让助理分析”。

![助理收起后，业务页面右上角保留打开助理按钮](/images/integration/host-assistant-closed.png)

**2. 点击“打开助理”。** 右侧显示已有助理，“打开助理”变为“关闭助理”。这一步只改变显示状态，不发送消息。

![点击业务页面的打开助理按钮，右侧显示嵌入式助理](/images/integration/host-assistant-open.png)

**3. 点击“让助理分析”。** 即使面板原本收起，也会先打开，再向当前会话发送“请检查当前演示页面并提出改进建议。”。图中消息已经进入会话，Mock 正在生成，分析按钮暂时禁用。

![业务分析按钮打开助理并发送消息，生成期间按钮禁用](/images/integration/host-assistant-message.png)

接入实际 Agent 服务后，通过 `<Agent getRunContext={...} />` 将待分析的页面内容或数据放进请求的 `context`，见[传入业务上下文](/development/agent-options.md#传入业务上下文)。仅在页面中显示助理，不会让 Agent 自动获得这些数据。

## 示例代码：Provider 接入

示例的接入文件是 `examples/creator-embedded-host/src/AgentMount.tsx`，页面按钮和面板在 `src/App.tsx`。下面提取其中的联动代码，省略编辑器和演示附件适配器。

```tsx
// AgentMount.tsx：项目参数传给 Agent
import { useAgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { Agent } from './agent-ui';

export function AgentMount() {
  const locale = useAgentUILocaleCode();
  return <Agent endpoint="/agent" locale={locale}
    onError={error => console.error('AGENT_UI_HOST_ERROR', error)} />;
}
```

将 `/agent` 改为业务的 AG-UI 地址；其他参数见[Agent 参数与配置](/development/agent-options.md)。

## 示例代码：业务按钮联动

```tsx
// App.tsx
import { useState, type ReactNode } from 'react';
import { useAgentUILocale } from '@za38.03/agent-ui-plugins';
import { AgentMount } from './AgentMount';
import { AgentUIProvider, useAgentUI, useAgentUIState } from '@za38.03/agent-ui-runtime';
import './host-control.css';

export function Workspace({ children }: { children: ReactNode }) {
  return (
    <AgentUIProvider>
      <BusinessPage>{children}</BusinessPage>
    </AgentUIProvider>
  );
}

function BusinessPage({ children }: { children: ReactNode }) {
  const { examples: copy } = useAgentUILocale();
  const host = useAgentUI();
  const ready = useAgentUIState(s => s.status === 'ready');
  const busy = useAgentUIState(s =>
    s.runtime?.run.status === 'running' ||
    s.runtime?.run.status === 'awaiting-input');
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [sendFailed, setSendFailed] = useState(false);

  async function analyzePage() {
    setAssistantOpen(true);
    setSendFailed(false);
    try {
      await host.sendMessage(copy.hostAnalyzePrompt);
    } catch {
      setSendFailed(true);
    }
  }

  return (
    <>
      <div className="host-assistant-actions">
        <button type="button" disabled={!ready || busy}
          onClick={() => { void analyzePage(); }}>
          {copy.hostAnalyzeButton}
        </button>
        <button type="button" aria-expanded={assistantOpen}
          aria-controls="business-assistant"
          onClick={() => setAssistantOpen(value => !value)}>
          {assistantOpen ? copy.hostCloseAssistant : copy.hostOpenAssistant}
        </button>
      </div>
      {sendFailed && <p role="alert">{copy.hostSendFailed}</p>}
      <div className="split-workspace" data-assistant-open={assistantOpen}>
        <section>{children}</section>
        <aside id="business-assistant" className="agent-pane"
          hidden={!assistantOpen} aria-label={copy.embeddedAssistant}>
          <AgentMount />
        </aside>
      </div>
    </>
  );
}
```

```css
/* host-control.css：示例布局，可替换为业务项目自己的样式 */
.host-assistant-actions { display: flex; gap: 12px; }
.split-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  height: 640px;
}
.split-workspace[data-assistant-open="false"] {
  grid-template-columns: minmax(0, 1fr);
}
.agent-pane { min-width: 0; min-height: 0; height: 100%; }
.agent-pane[hidden] { display: none; }
@media (max-width: 720px) {
  .split-workspace { grid-template-columns: minmax(0, 1fr); height: auto; }
  .agent-pane { height: 600px; }
}
```

示例从语言配置的 `examples` 分组读取文案：`hostOpenAssistant` 对应“打开助理”，`hostAnalyzePrompt` 对应发送给助理的消息。复制到自己的项目时，应替换为项目的中英文文案。示例通过 `src/ExampleLocaleHost.tsx` 中的 `AgentUILocaleProvider` 设置当前语言，并将它放在页面外层。

示例隐藏面板时仍会继续生成。如果关闭面板时也需要停止生成，在关闭按钮的处理函数中检查 `host.getSnapshot().status === 'ready'`，再调用 `host.abortRun()`。

## 其他方法示例

以下代码中的 `host` 均来自 Provider 内的 `const host = useAgentUI()`。

### 停止运行

```tsx
function stop() {
  if (host.getSnapshot().status === 'ready') host.abortRun();
}
```

`abortRun()` 发出停止请求后立即返回。需要确认生成是否已停止时，继续读取 `runtime.run.status`。

### 新建会话后提问

```tsx
async function askInNewConversation(prompt: string) {
  await host.startNewConversation();
  await host.sendMessage(prompt);
}
// 在按钮处理函数中调用，并用 try/catch 或 .catch(...) 反馈失败。
```

### 提交审批或补充信息

```tsx
async function answerInterrupt(interruptId: string, payload: unknown) {
  await host.resumeInterrupts([
    { interruptId, status: 'resolved', payload },
  ]);
}
```

Agent 暂停等待用户处理的请求称为“中断”。上例处理一个请求；如果同时存在多个请求，必须为每个请求提供一条响应。`interruptId` 使用当前请求的 ID，不能自行生成或重复填写；`payload` 填写用户的审批结果或补充信息，具体字段由该请求的 `responseSchema` 和业务约定决定。取消处理时使用 `status: 'cancelled'`。操作说明见[人机交互](/plugins/human-interaction.md)。

### 观察运行状态和事件

```tsx
import { useAgentUIEvent, useAgentUIState } from '@za38.03/agent-ui-runtime';

function RunObserver({ onRunEnd }: { onRunEnd: (status: string) => void }) {
  const status = useAgentUIState(s => s.runtime?.run.status ?? 'idle');
  useAgentUIEvent('run-end', ({ run }) => onRunEnd(run.status));
  return <output>{status}</output>;
}
```

示例直接显示 `running` 等状态值，便于检查；实际页面应显示语言配置中的对应文案。Hook 的选择器与监听规则见[API 参考](/development/react-host-api.md#hooks-与界面组件)。

运行结果判断和 `AGENT_UI_SESSION_ENDED` 等错误见[状态与错误参考](/development/react-host-api.md#状态与事件)。**同一 Provider 内只放一个 `<Agent />`**。
