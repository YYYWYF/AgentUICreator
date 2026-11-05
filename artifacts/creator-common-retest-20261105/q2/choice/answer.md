明白了：**接口结构与现有约定一致、无需鉴权、用固定地址**。这样只需要在项目里落一个明确的地址配置点。我先确认应用入口有没有已存在的配置位。写入权限已确认。这一步只动项目自有代码（不涉及 npm 实现接管）。我先重新读一次要改的配置文件。现在把「固定地址」这个配置点落到项目自有代码里（`services/conversations/http-data-source.ts` 的 npm/其他文件不动）。配置点已写入。让它可以从服务入口统一引用（与 `resolveConversationDataEndpoint` 保持一致），然后跑校验。已把「固定地址」这个接入点落到项目自有代码，并通过了类型校验；但**还差你接口的地址值**，所以历史目前仍是空的。

## 本轮实际改动（2 个文件，均为项目自有代码）

1. `src/agent-ui/services/conversations/endpoint.ts`
   新增 `CONVERSATION_HISTORY_ENDPOINT`（固定基础地址常量，当前为空字符串），并让解析逻辑优先使用预览环境覆盖、其次使用该常量：
   - 覆盖值 → 预览环境临时指向测试服务；
   - 否则 → 你的固定地址；
   - 两者都空 → 仍回落到空数据源（会话列表为空，行为与现在一致，不会引入新错误）。

2. `src/agent-ui/services/conversations.ts`
   把该常量与 `resolveConversationDataEndpoint` 一起从服务入口导出，保持与原有引用方式一致。

校验结果：`pnpm run typecheck` **通过**（delta 模式，本次未引入任何类型/静态问题）。未做运行时与后端连通验证——目前没有可请求的地址，也没接测试服务。

## 你选定方案后我需要确认的接口约定

数据源已按「结构与现有约定一致、无鉴权」工作，请求路径固定为下面这组（都在 `services/conversations/http-data-source.ts` 的 `conversationRequests` 里，如需改路径我改一处即可）：

| 操作 | 方法与路径（相对基础地址） |
| --- | --- |
| 列表 | `GET {base}/conversations` |
| 详情 | `GET {base}/conversation/{id}`（注意是单数） |
| 删除 | `DELETE {base}/conversations/{id}` |
| 重命名 | `PATCH {base}/conversations/{id}`，body `{ title }` |
| 归档 / 取消归档 | `POST {base}/conversations/{id}/archive`、`.../unarchive` |

期望的响应：列表 `{ conversations: [{ id, title }] }`（`status`/`updatedAt` 可选），详情 `{ id, title, state }`（`agentState` 可选）。鉴权保持无凭据：`credentials` 为 `same-origin`，跨源时**不会**携带 Cookie。

## 需要你提供的一件事

请把你的历史接口**基础地址**发我（例如 `https://history.example.com/api` 或同源 `/api`），我写入 `CONVERSATION_HISTORY_ENDPOINT` 后即生效；同时请确认上表路径与你的后端一致，不一致我按你的实际路径调整 `conversationRequests`。

另外两点提醒，避免接上后返工：
- 若地址是跨源绝对 URL，你的服务需允许当前页面的来源（CORS）。
- 读取历史与继续对话是两件事：历史接上后，继续提问仍由 AG-UI 的 Agent 地址负责，两者互不影响。
