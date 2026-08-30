# Ant Design X 模板插件库

这组模板属于生成项目本身，依赖也安装在 `@agent-ui/example-agent-frontend`，不依赖 `@agent-ui/creator`。

当前模板：

- `antd-x-theme-provider`：通过插件服务注册表提供 `agent-ui.theme` 能力，不直接渲染 UI。
- `antd-x-theme-switch`：声明 `inject: ["agent-ui.theme"]`，调用另一个插件暴露的主题函数。
- `antd-x-welcome`：用 `Welcome` 展示 Agent 身份与共享运行状态。
- `antd-x-message-list`：用 `Bubble.List` 渲染 AG-UI 消息。
- `antd-x-prompts`：用 `Prompts` 提供可配置且可直接发送的快捷提示。
- `antd-x-sender`：用 `Sender` 发送消息，并在运行期间提供停止操作。

`index.ts` 导出的 `antdXTemplatePlugins` 可直接注册到 `PluginRegistry`。模板只消费 `UIPluginContext`，不会创建或持有 Agent Runtime。布局、顺序和实例 props 都由 `app-ui/app-ui.json` 决定。主题提供者和开关也分别是独立实例，展示了通用的插件间函数调用能力，而不是主题专用 Runtime API。
