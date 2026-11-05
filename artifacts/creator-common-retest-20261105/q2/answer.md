我先读取要改的配置文件和数据源实现，确认路径与当前的约定完全一致。路径与 `conversationRequests` 完全一致（列表 `GET /conversations`、详情 `GET /conversation/{id}` 等），无鉴权也对得上。现在写入基础地址。基础地址已写入。现在确认数据源 Plugin 确实用这个解析值创建 HTTP 数据源。数据源 Plugin 只是透传。我需要确认 `resolveConversationDataEndpoint` 的实际调用处，以及 `credentials`/来源约束。数据链路已确认可用：`setup` 解析出地址后就创建 HTTP 数据源。还剩一个关键点要核实——请求实际由 `createAgentBackendTransport` 发出，我需要确认它不会把绝对地址改写到开发代理。数据链路已确认。还需核实一个会决定请求能否打通的细节：`createAgentBackendTransport` 是否会把绝对 URL 改写/代理。我读一下它的实现。源码侧改动已完成并核验。我尝试暴露校验工具，跑一次当前修订的静态校验。已接上。历史会话现在指向你的接口 `http://127.0.0.1:47835`。

## 改动（1 个文件，项目自有代码）

`/src/agent-ui/services/conversations/endpoint.ts`
```ts
export const CONVERSATION_HISTORY_ENDPOINT = 'http://127.0.0.1:47835';
```
只改了这一行常量（连同注释更新为「这是业务历史服务的固定基址」）。`tests/services/...` 之类、npm 实现、生成文件、组合状态均未触碰。

## 链路已核对（读代码确认，非推断）

- `plugins/conversation-data-source/definition.ts` 在 `setup` 里调用 `resolveConversationDataEndpoint({ configuredEndpoint: 预览环境覆盖 })`，拿到地址后 `createHttpConversationDataSource({ endpoint })` 并把实例 `provide` 为 `agent-ui.conversation-data-source`。
- `agent-ui.conversation-data-source`（p0，应用级，已启用）→ 生产 `agent-ui.conversations` 服务（`conversation-service` p1）→ `conversation-thread-list`（p6，左侧栏）通过 `useConversations()` 订阅快照、`useConversationActions()` 触发刷新/重命名/删除/归档。
- 路径与你确认的一致：列表 `GET /conversations`、详情 `GET /conversation/{id}`、重命名 `PATCH /conversations/{id}`、删除 `DELETE /conversations/{id}`、归档 `POST /conversations/{id}/archive`、取消归档 `POST /conversations/{id}/unarchive`；无鉴权头，`credentials: 'same-origin'`。
- 响应格式：直连 DTO 与 `returnCode/body` 包装两种都支持，所以你说的「现有约定格式」无需改映射。
- 之前为空时走 `createEmptyConversationDataSource()`，现在有地址即走 HTTP；地址被清空会自动回落空数据源。

## 校验结果（实际执行）

`validate_creator_changes`（delta 模式）= **passed**：`pnpm run typecheck` 退出码 0，本次未引入任何类型/静态问题，无工作区新增警告。

## 两个需要你留意的运行时风险（本轮未验证）

1. **跨源与混合内容**：`127.0.0.1:47835` 与应用页面不同源。若预览页面是 `https://`，浏览器会以混合内容直接拦掉 `http://` 请求；若同源或 `http://`，则需要你的服务返回允许该来源的 CORS 头（无鉴权时通常不涉及预检，但 `PATCH`/`DELETE` 会触发预检）。这两种失败都会表现为历史列表加载报错而不是空列表，便于区分。
2. **请求实际经由 Agent 后端传输层发出**：数据源用的是 `createAgentBackendTransport({ development })` 的 `fetch`，而非裸 `window.fetch`。我尝试读取该 npm 实现以确认它是否对绝对 URL 做开发代理改写，但该路径属受保护区域，读取被拒绝。因此「绝对地址会直连」这一点我没有实现层证据；如果接上后请求打到了非预期位置，请告诉我，我再从允许的入口核对。

最后说明边界：以上是源码接线 + 静态校验的结论，**我没有验证你的服务真实返回**（也没有发起请求的能力）。请你刷新预览、看左侧「历史会话」是否能列出你的数据；如果报错，把浏览器 Network 里的状态码或错误文案发我，我按现象定位。
