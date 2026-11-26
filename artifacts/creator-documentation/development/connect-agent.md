# 连接 AG-UI 服务

生成的 Agent 前端通过一个 AG-UI 接口与业务 Agent 通信。完成页面挂载后，在页面的 Agent 配置中填写服务地址，再验证消息与运行状态。

**修改位置：**&#x4E1A;务项目挂载 `<Agent />` 的文件，例如 `src/AssistantPage.tsx`。需要自定义请求时，新建 `src/agent-ui/services/agent-transport.ts` 并通过 `fetch` 传入。

具体插件需要的事件名、数据字段和完整 SSE 格式，见[AG-UI 数据格式与插件数据接入](/plugins/ag-ui-data.md)。仅启用插件或返回普通文本，不能自动显示图表、计划或工具卡片。

## 配置应用地址

React 工程在生成的 `Agent` 上传入业务 endpoint：

```tsx
// src/AssistantPage.tsx
import { Agent } from './agent-ui';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" locale="zh-CN" />;
}
```

- **React 业务联动**：从 `@za38.03/agent-ui-runtime` 导入 `AgentUIProvider`，包住业务组件和 Agent；endpoint 仍传给 `<Agent />`。配置见[Agent 参数与配置](/development/agent-options.md)。
- **Vue／HTML**：在 [Web Component](/development/web-component.md) 的 attribute 或 config 中配置地址。

`/api/agent` 应指向业务 AG-UI 服务或网关。**接口需返回当前客户端支持的 AG-UI 事件流**；**模型服务的 Chat Completions JSON 不能直接作为这个接口**。

## 请求体与响应流

配置 `endpoint="/api/agent"` 后，前端向该地址发送 POST 请求，正文为 AG-UI `RunAgentInput` JSON。下面是一条普通文字消息：

```json ag-ui
{
  "threadId": "thread-123",
  "runId": "run-456",
  "messages": [{ "id": "user-1", "role": "user", "content": "查询订单 O-1042" }],
  "state": {},
  "tools": [],
  "context": [],
  "forwardedProps": {}
}
```

`threadId`、`runId` 可由 [`beforeRequest`](#发送前准备请求) 返回业务 ID，省略时由 Runtime 补全。会话绑定后沿用同一 `threadId`，响应事件使用最终请求中的 ID。

| 字段               | 服务端如何使用                                                       |
| ---------------- | ------------------------------------------------------------- |
| `threadId`       | 当前会话 ID。同一会话后续请求沿用它，后端按它维护对话上下文                               |
| `runId`          | 本次运行 ID，响应的运行事件使用相同值                                          |
| `messages`       | 普通发送默认只包含本次用户消息；前端工具续传只带本次工具结果。不要假设每次都收到全量历史                  |
| `state`          | AG-UI 当前共享状态，实际结构按业务协议约定                                      |
| `tools`          | 当前明确开放给 Agent 的前端工具声明，见[前端工具](/development/frontend-tools.md) |
| `context`        | 当前业务上下文条目，见[上下文接入](/development/business-context.md)          |
| `forwardedProps` | 当前运行传递的扩展配置；适配请求时保留                                           |

通过 `<Agent ctx={...} />` 设置每次携带的默认参数，通过 `sendMessage(input, { ctx })` 添加本次参数，后端从 `forwardedProps.ctx` 读取。示例见[业务参数 ctx](/development/business-context.md#业务参数-ctx)。

审批恢复还会使用 `resume` 等协议字段，不能用固定的 `{ prompt: ... }` 替代所有请求。媒体、工具和审批请求应按实际请求保留完整结构。

响应为 `Content-Type: text/event-stream`，每条事件以 `data: JSON` 加空行分隔。例如本次文字回复：

```text
data: {"type":"RUN_STARTED","threadId":"thread-123","runId":"run-456"}

data: {"type":"TEXT_MESSAGE_START","messageId":"answer-1","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"answer-1","delta":"订单正在配送。"}

data: {"type":"TEXT_MESSAGE_END","messageId":"answer-1"}

data: {"type":"RUN_FINISHED","threadId":"thread-123","runId":"run-456","outcome":{"type":"success"}}

```

多段文字重复发送同一 `messageId` 的 `TEXT_MESSAGE_CONTENT`。不要返回 JSON 数组或用普通 JSON 包装整个 SSE；响应头正确但正文不是事件流也不能工作。失败使用失败 HTTP 状态或 AG-UI `RUN_ERROR`；审批中断及工具、状态、消息卡片见[事件格式](/plugins/ag-ui-data.md)。

## 请求头与鉴权

在业务页面通过 `Agent` 的 `request` 属性传入 AG-UI 请求的 headers 和 Cookie 策略。例如，`token` 和 `tenantId` 由业务页面当前的登录状态提供：

```tsx
<Agent
  endpoint="/api/agent"
  request={{
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Id': tenantId,
    },
    credentials: 'include',
  }}
/>
```

- `request.headers` 是 `Record<string, string>`，用于传入自定义请求头，不接受回调。登录凭据变化后，由页面更新 props；后续请求使用更新后的配置。
- `request.credentials` 支持 `omit`、`same-origin`、`include`。不传时沿用浏览器 Fetch 的默认行为；需要跨域携带 Cookie 时使用 `include`，服务端同时需要允许对应来源、请求头和凭据。
- 这里只传浏览器可持有的用户凭据；模型 API Key 等服务端密钥由业务网关保管。`Agent user` 只用于用户资料展示，不会自动生成鉴权头。

`AgentApplication` 和 `AgentUIApplication` 也支持相同的 `request` 属性。此配置用于 AG-UI 请求；历史、上传、转写和评价接口的鉴权需在各自的服务配置中设置，见[会话服务](/development/history-backend.md#地址与鉴权配置)和[业务服务接入总览](/development/service-integration.md#服务鉴权配置)。

**主动开启 Creator 临时连接后，会覆盖应用传入的 `endpoint` 并清除 `request` 配置**，因此临时连接请求不会携带这里配置的自定义 headers 或 Cookie 策略。「连接 Agent」面板目前只配置地址和连接方式；验证应用的鉴权配置时，请保持临时连接关闭。

## 发送前准备请求

需要在首次发送前调用业务接口申请会话 ID，或为每次运行补充参数时，给 `<Agent />` 传入可选的 `beforeRequest`。它支持同步或异步返回部分 AG-UI `RunAgentInput` 字段；省略时保持原有请求行为，生成项目不会默认添加这个回调。

```tsx
import type { AgentUIBeforeRequest } from '@za38.03/agent-ui-runtime';
import { Agent } from './agent-ui';

const beforeRequest: AgentUIBeforeRequest = async (input, { signal }) => {
  if (input.threadId) return {};

  const response = await fetch('/api/conversations', {
    method: 'POST',
    signal,
  });
  if (!response.ok) throw new Error('CREATE_CONVERSATION_FAILED');
  const result: unknown = await response.json();
  if (typeof result !== 'object' || result === null ||
      !('threadId' in result) || typeof result.threadId !== 'string') {
    throw new Error('INVALID_CONVERSATION_ID');
  }
  return { threadId: result.threadId };
};

export function AssistantPage() {
  return <Agent endpoint="/api/agent" beforeRequest={beforeRequest} />;
}
```

`beforeRequest` 在 Composer 组装和 `ctx` 合并后执行，完成后再发送。通过返回值提交修改；需要调用业务接口时，像示例一样传递 `signal`，以便停止时取消等待。

### 调用与身份规则

- 首次发送、后续消息、重试、工具续传和审批恢复都会调用；历史查询、附件上传不经过它。
- 新会话首次调用时，`input.threadId` 尚未设置。返回业务 ID 后，该会话后续请求沿用它；打开历史时直接收到已有 ID，不能再改成另一个 ID。
- `input.runId` 留待回调提供；省略时使用默认值。每次运行分别确定，后端按最终请求中的值返回事件。
- 首次发送前的会话 ID 是本地草稿标识。需要保存业务 ID 时，在绑定后的 `thread-change` 中读取。

### 返回字段如何合并

返回的字段覆盖原值，`undefined` 保留原值。数组和 `state` 整体替换；`forwardedProps` 及其中的 `ctx` 按键合并，其他嵌套对象整体替换。

例如，下面会保留已有 `forwardedProps`、`ctx` 的其他字段：

```ts
const beforeRequest: AgentUIBeforeRequest = () => ({
  forwardedProps: { ctx: { tenantId: 'tenant-1' } },
});
```

业务扩展参数放入 `forwardedProps`。

回调失败时不发送请求，错误交给 `onError`；程序化发送也会报错。消息保留供重试，已绑定的会话 ID 不变。停止或卸载后，回调的迟到结果不会继续触发发送。

`AgentApplication`、`AgentUIApplication` 和直接使用的 `ConversationRuntimeProvider` 支持同名属性。更新回调后，后续请求使用新回调，已绑定身份保留。Creator 临时预览绕过业务 `beforeRequest`，关闭临时连接后恢复。

## 自定义请求函数

接口需要动态获取凭据、增加业务包装或复用请求模块时，新建 `src/agent-ui/services/agent-transport.ts`。下面示例假设网关接收 `{ input: RunAgentInput }`，并仍然返回 AG-UI SSE；如果网关直接接收标准请求，移除 `body` 的包装即可：

```ts
// src/agent-ui/services/agent-transport.ts
import type { ConversationRuntimeProviderProps } from '@za38.03/agent-ui-runtime';

export const agentFetch: NonNullable<ConversationRuntimeProviderProps['fetch']> =
  async (url, init = {}) => {
    if (typeof init.body !== 'string') throw new Error('INVALID_AGENT_REQUEST');
    const input: unknown = JSON.parse(init.body);
    return globalThis.fetch(url, {
      ...init, // 保留 method、headers、credentials 和 signal。
      body: JSON.stringify({ input }),
    });
  };
```

在 `src/AssistantPage.tsx` 导入并传入：

```tsx
import { Agent } from './agent-ui';
import { agentFetch } from './agent-ui/services/agent-transport';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" fetch={agentFetch} />;
}
```

自定义请求函数需要满足：

- **输入**：接收实际请求地址，以及已合并 `request.headers`、`request.credentials` 的请求参数。
- **返回**：返回 `Promise<Response>`，保留浏览器 `Response` 的流式 body；不能返回 Axios 的普通数据对象。
- **协议转换**：自己的响应协议不同时，在这个文件中转换为 AG-UI 流；上面的请求包装示例没有实现响应转换。

可以在这里调用现有请求模块。OpenAI 等模型的原始流，不能仅改 Content-Type 就当作 AG-UI。

保留请求的 `signal`，让停止生成能取消实际请求；转换 body 时保留会话标识、工具结果和中断恢复等协议字段。请求失败时抛出错误或返回相应 HTTP 失败响应。首次发送、重试、前端工具续传和中断恢复均经过此函数；它不接管历史查询、附件上传等独立服务。

`AgentApplication`、`AgentUIApplication` 和直接使用的 `ConversationRuntimeProvider` 均支持同名属性。省略时继续使用默认 fetch。更新函数后，后续请求使用新函数，已有会话保持。Creator 临时预览会绕过业务 `fetch`，使用预览连接；关闭临时连接后恢复。

## 同一会话调用不同工作流

在 `src/agent-ui/plugins/composer/index.tsx` 的已有组合中放置 `ConversationComposerSend endpoint="/api/workflows/..."`，具体 JSX 见[多 Agent 与工作流入口](/development/multiple-agents.md#同一助手的工作流入口)。

- **会话身份**：继续使用同一 Thread，只有显式新建会话才创建新 threadId。
- **后续请求**：工具续传、重试和审批恢复沿用原运行入口；各工作流后端需要共享该会话上下文。
- **独立助手**：使用不同 `agentId`，不要将各自的独立流混到一个 Thread。

## 验证实际响应

1. 确认地址指向本次要接入的业务服务，停止当前助理运行后再切换。
2. 新建会话并发送测试消息，检查实际请求地址、HTTP 状态与流式响应。
3. 检查首段输出、后续更新和最终运行状态；有工具或审批流程时，使用对应业务场景验证。
4. 检查错误、取消和网络中断的表现。收到部分文字或显示 ready，都不足以说明一次运行已经完成。

历史记录单独按[会话服务](/development/history-backend.md)接入。

## 临时连接测试

Creator 默认使用应用代码中的 `endpoint`、`fetch` 等配置。需要临时测试时，在「设置 → 连接 Agent」中点击「使用此地址」或「使用示例 Agent」才会开启临时连接；只修改连接方式不会开启。已保存的明确开启或关闭状态会保留，旧配置未记录开启状态时默认关闭。**临时连接仅在开发态生效，生产环境以应用代码中的配置为准。**

临时连接可填写完整 HTTP(S) 地址或相对路径。相对路径按**业务页面地址**解析，保存后显示并使用完整 URL，不会拼接 Creator 服务地址。

业务页面为 `http://localhost:5173/orders/` 时：

| 填写值          | 实际地址                                 |
| ------------ | ------------------------------------ |
| `/api/agent` | `http://localhost:5173/api/agent`    |
| `./agent`    | `http://localhost:5173/orders/agent` |

无法取得业务页面地址时，先打开业务页面，或填写完整地址。

「直接连接」由业务页面的浏览器请求该地址，跨域时需要 Agent 服务允许访问；「转发」由 Creator 开发服务请求解析后的同一地址，再将响应传回页面。业务工程已有开发代理时，相对路径可以继续使用它。

测试结束后，点击「关闭临时连接」，即可恢复使用应用代码中的 `endpoint`。已保存的地址会保留；有正在运行的对话时，需先停止运行。

![Creator 的「连接 Agent」设置：填写服务地址，选择连接方式并使用此地址。](/images/development/agent-connection.png)
