# 回复评价服务

默认点赞／点踩只保留当前会话界面的选择。需要保存到业务系统时，通过 `feedback` 配置。配置不会自动在历史加载时恢复服务端的评价选择。

## 1. 修改入口

新建 `src/agent-ui/services/feedback.ts`：

```ts
import type { ConversationRuntimeProviderProps } from '@za38.03/agent-ui-runtime';

export const feedback = {
  url: '/api/feedback',
  credentials: 'include',
} satisfies Exclude<ConversationRuntimeProviderProps['feedback'], false | undefined>;
```

在业务挂载文件 `src/AssistantPage.tsx` 中接线：

```tsx
import { Agent } from './agent-ui';
import { feedback } from './agent-ui/services/feedback';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" feedback={feedback}
    onError={error => console.error('AGENT_UI_ERROR', error)} />;
}
```

保留回复操作区的 `feedback-actions` 插件。项目将 `onError` 接入自己的日志和本地化提示；评价失败不等于 Agent 推理失败。Vue/HTML 见[生产工程接线](/development/service-integration.md#vue--html-服务适配位置)。

## 2. 默认 HTTP 请求与响应

用户选择评价时请求 `POST /api/feedback`，`Content-Type: application/json`：

```json
{
  "threadId": "thread-123",
  "messageId": "answer-1",
  "type": "negative",
  "comment": "没有解释查询条件。"
}
```

| 字段          | 约定                        |
| ----------- | ------------------------- |
| `threadId`  | 评价所属的会话 ID                |
| `messageId` | 被评价的助手消息 ID               |
| `type`      | `positive` 或 `negative`   |
| `comment`   | 可选，提供说明时才包含；默认赞踩按钮不一定收集说明 |

成功接受任意成功 HTTP 状态，包括 `204 No Content`，**不解析响应正文**。失败使用失败 HTTP 状态。如果接口以“200 + JSON 业务码”表示失败，必须使用数据源检查，否则会被当成成功。

界面选择由会话组件管理，看到按钮选中不代表保存成功。保存异常通过 `onError` 报告，不承诺自动撤回界面选择。

## 3. 字段与业务返回码适配

改写 `services/feedback.ts`。示例接口需要 `conversation_id`、`answer_id`、`score` 和 `reason`，响应为 `{ "code": 0 }`：

```ts
import { z } from 'zod';
import type { FeedbackDataSource, ConversationRuntimeProviderProps } from '@za38.03/agent-ui-runtime';

const responseSchema = z.object({ code: z.literal(0) });

const feedbackDataSource: FeedbackDataSource = {
  async submit(value) {
    const response = await fetch('/business/answers/rate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: value.threadId,
        answer_id: value.messageId,
        score: value.type === 'positive' ? 1 : -1,
        ...(value.comment === undefined ? {} : { reason: value.comment }),
      }),
    });
    if (!response.ok) throw new Error('FEEDBACK_SAVE_FAILED');
    responseSchema.parse(await response.json());
  },
};

export const feedback = {
  dataSource: feedbackDataSource,
} satisfies Exclude<ConversationRuntimeProviderProps['feedback'], false | undefined>;
```

使用项目已有 `zod`，或调用已有业务 API 并判断成功码。`submit()` 成功无需返回内容，失败抛错；当前方法没有取消 signal 参数。数据源的鉴权自行处理，外层 URL、headers、credentials 不会应用到它。

也可直接传 `<Agent feedbackAdapter={feedbackDataSource} />`，使用相同 `submit()` 契约。优先级为显式 `feedbackAdapter` → `feedback.dataSource` → `feedback.url` → 仅保留界面选择。`feedback={false}` 关闭内置适配器，按钮显示另在布局或组件应用层调整。

## 4. 验证

分别点击赞和踩，核对当前 `threadId`、被评价消息 ID 和类型；说明检查 `comment`。模拟 HTTP 失败和“200 + 业务失败码”，确认页面能捕获错误。刷新后查询业务系统确认实际保存结果，不只看按钮是否选中。
