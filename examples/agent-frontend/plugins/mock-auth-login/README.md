# 登录示意

通过 `application.gate` 控制应用入口，在 `applicationPlugins` 启用。
点击按钮建立内存中的示例会话；刷新后重新显示登录页。不收集凭据或请求认证 API。

接入内部体系时，替换 `mock-auth-controller.ts` 的 Service 实现，保留
`services/auth-session.ts` 的 `auth.session` / `auth.gate` 消费边界。
在 `setup()` 同步提供 Gate Service 后再恢复真实会话；恢复期间使用 `checking`，
未登录用 `blocked`，认证成功用 `ready`。退出或会话失效时清空会话并恢复 `blocked`。
此示意只控制前端入口，真实 API 认证由内部体系提供。
