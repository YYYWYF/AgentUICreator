# Host-owned Integration Recipe

Creator 定制的生产前端是 React。Vue、HTML 等 Host 通过 Web Component 消费编译产物；不生成原生 Vue Plugin，不把消费者目录当成可直接编辑的 React 实现。

## 计划与执行

Host 通过 plan_agent_ui_integration、apply_agent_ui_integration、prepare_agent_ui_integration_asset 和 verify_agent_ui_integration 工具提供 canonical recipe。内部实现位于 `packages/creator/operator/src/project/integration-recipe.ts`；具体参数来自当前 Project Control 合同，不在提示词中复制代码。

规划只读，明确目标、生产工程与消费者、必要文件、编译资源及当前状态。用户确认具体方案后，由 Host 受控入口执行；普通问答或手动接入指南不直接写业务工程。模型不猜测 Host framework、重建 recipe 或执行任意安装命令。

缺少编译资源时，准备入口只处理方案指定的资源，不等于应用已接入。检查使用原方案和当前文件，不把历史 ready 状态当成本次验证。

## React producer 与消费者

独立 npm/pnpm Vue Host 的初始化准备单独的 React producer（默认 agent-ui/），先展示实际安装与依赖方案。producer 拥有自己的依赖、AppUIModel、Plugin 源码和 dev/test/typecheck/build 脚本。

Host 的 .agent-ui/producer.json 与 producer 的 .agent-ui/consumer.json 记录相互绑定。Creator Dock 保留 Host workspace 身份，但插件编辑、更新和源码所有权针对 React producer。凭据沿用 Host 实际配置，不复制进应用源码。

显式 Build and update host 操作构建 producer，再将其 dist/agent-ui-web-component/agent-ui.js 发布到已绑定消费者的 public/agent-ui.js。发布检查源输入、旧产物 hash 和当前绑定，不覆盖消费者其他修改。普通源码编辑不自动发布编译包。

## Web Component

公开入口由 `@za38.03/agent-ui-web-component` 提供，包含 register、agent-ui.js 和 producer 用 host 工厂。消费者只载入编译 JavaScript，不安装 producer 的 React 构建依赖。

保留已有 React composition、Plugin、Services 和 Shadow Root。Portal 留在拥有它的主题容器内，不创建第二个 Agent Runtime。未绑定自定义 producer 的消费者使用方案明确选择的官方编译产物，不冒充已定制版本。

theme、locale、地址和事件沿用当前公开合同。省略主题时使用默认且允许内部切换；Host 受控 theme 时通过 theme-change/onThemeChange 接受 UI 请求。尺寸由实际 Host 容器和产品 Shell 决定，不强制改为另一种产品形态。

## 验证

验证准确文件变更、资源身份、producer 构建、发布前后 hash、实际组件挂载、主题/语言、会话与草稿、卸载清理和生产依赖隔离。静态检查、实际 Host 浏览器、业务连接与 Windows 实机分别报告。

公开接入示例见 [React](../../../development/react.md)、[Vue](../../../development/vue.md) 和 [Web Component](../../../development/web-component.md)。Creator 进程与配置见 [TypeScript 发行](../../packages/creator/docs/typescript-distribution.md)。
