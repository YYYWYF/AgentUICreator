# 可选认证与账号插件

auth-gate 拥有 auth.gate 与 auth.session；auth-account 展示当前用户或可选的会话状态。两者均不属于默认 preset。官方实现通过 Plugins npm 包交付，项目保留薄应用入口与自己的业务认证配置。

## 已有 Host 登录

只需要展示 Host 用户时，组合 auth-account，不额外创建登录 Gate。业务组件与 Agent 使用 Runtime 的 AgentUIProvider 或 Agent.user 传入公开 profile，复用现有用户上下文。

userId、userName、avatar 均可选。Agent、Agent user=null 和空 profile 保留各自公开语义；展示 profile 不等于完成认证，也不能绕过已存在的 Gate。Host 登录、权限、会话和凭据仍属于业务应用。

## Plugin 管理的登录

auth-gate 是 Application Gate，加入 AppUIModel.applicationPlugins，不放在普通布局或弹窗位置。它提供的服务在 setup 中注册，异步会话恢复使用现有 Adapter，Gate 根据真实状态决定 checking、blocked、ready 或 error。

配置应用现有 auth Adapter，保留已有 services 声明与实现。只有缺失文件按安装 catalog 的受控模板初始化；不覆盖业务认证代码，不因 npm 更新重置连接或身份配置。新增公共 Service 契约使用独立的具体方案授权。

可选 auth-account 放在用户要求的普通布局 Slot，沿用已有 Sidebar、Header、Footer 和实例。不要为了展示账号擅自重建整个布局。

## 所有权与验证

先定制项目薄层 props、公开组合和应用 Adapter；需要维护官方实现内部时才提出明确源码接管。安装、配置、组合和验证是不同事实，失败时准确报告实际已保存阶段。

验证已有 Host 登录、空 profile、登录/退出、会话恢复、失败、Gate 阻止进入、服务停用与账号展示，以及主题、语言和用户信息隔离。业务认证必须使用真实服务或明确的测试 Adapter；Mock 登录和静态构建不证明真实权限正确。

应用层与共享服务保护见 [源码所有权](../../architecture/npm-default-plugin-source-ownership.md)，Gate 与 Service 的公开合同见 [插件开发接口](../../../website/docs/development/plugin-api.md)。
