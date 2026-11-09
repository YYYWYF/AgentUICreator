# 会话数据源（conversation-data-source）

连接业务系统中的历史会话，让用户查看会话列表和之前的聊天记录。接入这项能力时，最重要的是提供实际接口资料。

## 需要提供什么

| 信息      | 说明                          |
| ------- | --------------------------- |
| 接口地址    | 列表、详情、删除；需要重命名或归档时，再提供相应接口。 |
| 鉴权方式    | 如何沿用现有登录态、请求头或 Cookie。      |
| 请求和响应示例 | 包括成功结果、错误结果、会话 ID 和消息结构。    |
| 需要开放的操作 | 是否允许删除、重命名、归档及取消归档。         |

历史记录需要由业务后端保存。读取历史和继续对话是不同能力；需要继续提问或恢复任务时，也要说明 Agent 接口支持的方式。

## 怎么让 Creator 修改

将接口资料一起交给 Creator，例如：

```text
请接入现有的会话历史服务：
列表接口：【地址】，详情接口：【地址】，删除接口：【地址】。
鉴权：【沿用现有登录态，具体方式如下】。
请求和响应示例：【粘贴接口说明】。

保留现有会话列表和切换方式；暂不提供重命名和归档入口。
请检查资料，缺少信息时先询问，不要编造业务接口。
```

只修改某个接口时，说清楚要改哪项及需要保留的行为。接入后，检查列表、打开历史、删除、请求失败提示和刷新后的记录；涉及登录态时，再检查账号切换。

## 手动接入

假设生成目录为 `src/agent-ui/`，在 `src/App.tsx` 中传入项目已有的 HTTP 数据源：

```tsx
import { Agent } from './agent-ui';
import { createHttpConversationDataSource } from './agent-ui/services/conversations';

const history = createHttpConversationDataSource({ endpoint: '/api' });

export function App() {
  return <Agent endpoint="/agent" conversationDataSource={history} />;
}
```

这里 `/api` 是历史接口基础地址，`/agent` 是实时 AG-UI 地址。数据源实例应保持稳定；保留数据源和会话服务插件启用。

具体路由、鉴权和响应转换在生成目录的 `services/conversations/http-data-source.ts` 中按业务接口适配。完整格式及可选操作见[接入历史会话](/development/history-backend.md)。
