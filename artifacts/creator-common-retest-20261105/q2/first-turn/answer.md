我先读清项目现有的会话数据源实现和官方接入方式，再给你具体方案。项目里已经有一套**项目自有的 HTTP 会话数据源**（路由与请求可直接改），我继续确认它是怎么接进应用的，以及官方推荐的配置位置。项目侧已经有完整的历史接入点，我再确认它现在把数据源接在哪里、endpoint 从哪来。我已经把项目侧现有的接法看清了。现状是这样：

**当前历史数据链路（已就绪，可直接改）**
- 组合里已启用 `conversation-data-source`（应用级 p0），它 `provides` 服务 `agent-ui.conversation-data-source`，把数据源实现注入给会话服务。
- 数据源工厂在 `/src/agent-ui/services/conversations/http-data-source.ts`，路由集中在文件顶部项目自有的 `conversationRequests` 对象里：列表 `{base}/conversations`、详情 `{base}/conversation/{id}`、删除/重命名 `{base}/conversations/{id}`、归档 `{base}/conversations/{id}/archive`、取消归档 `.../unarchive`；请求头由 `headers()` 返回，`credentials` 为 `same-origin`。
- 响应解析已支持**两种格式**：直连 DTO（`{conversations:[{id,title}]}` / `{id,title,state}`）与业务包装（`returnCode: "SUC0000"` + `body.thread_id` / `body.max_message_checkpoint.values|channel_values`）。
- 基础地址来自 `resolveConversationDataEndpoint`，实际值取 `getPreviewAgentEnvironment(...).conversationDataEndpointOverride`；**未配置时使用空数据源**（列表为空，刷新也不会出现历史）。`Agent endpoint` 只管 AG-UI 地址，与历史接口无关。

所以「换成你自己的接口」本质上是在这一处做适配：基础地址 + 路由 + 鉴权头 + 字段映射。我不需要你重写任何 Plugin，也不需要接管 npm 实现。

**我需要你给的外部事实**（这些无法从代码推断，猜错会直接导致列表/详情请求打空）：

1. **接口形态**：列表和详情返回什么结构、字段叫什么。最省事的是你贴一段真实响应示例（脱敏即可），或者告诉我它是否就是上面那两种已支持的格式之一。
2. **鉴权**：同源 Cookie、Bearer Token（由现有登录取得的 token）、还是自定义请求头？
3. **基础地址**：是已经在环境里通过 `conversationDataEndpointOverride` 注入了，还是需要一个固定 URL / 同源 ` /api ` 前缀？

为了少来回几轮，我先按这三项问一次：
