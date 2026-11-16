---
title: "一号通登录（开发中）"
---

# 一号通登录（开发中）

一号通登录接入**开发中**。当前只支持业务系统在外部自行完成登录，再将用户凭据和用户信息传给 Agent UI。

## 外部登录凭据与用户信息

修改业务项目挂载 `<Agent />` 的文件，例如 `src/AssistantPage.tsx`。下面的 `token` 和 `user` 由业务系统已有登录流程提供：

```tsx
import { Agent } from './agent-ui';

export function AssistantPage({ token, user }: {
  token: string;
  user: { userId: string; userName: string; avatar?: string };
}) {
  return <Agent
    endpoint="/api/agent"
    request={{
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    }}
    user={user}
  />;
}
```

- `request.headers`：传入 AG-UI 接口要求的请求头。示例使用 Bearer Token，实际按业务接口约定修改；凭据更新后更新 props。
- `request.credentials`：使用 Cookie 登录态时配置；跨域携带 Cookie 使用 `include`，服务端需配套允许。无需 Cookie 时可省略。
- `user`：传入展示资料，字段为 `userId`、`userName` 和可选 `avatar`。将业务登录结果映射成这些字段即可；用户信息不代替接口鉴权，也不会自动作为请求头发送。

有共享 `AgentUIProvider` 时，也可通过 `<AgentUIProvider user={user}>` 提供展示资料，内部 Agent 继承；Agent 显式传入的 `user` 优先。历史、上传和评价等接口的鉴权仍需[分别配置](./service-integration#服务鉴权配置)。
