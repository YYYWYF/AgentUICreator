# Ant Design X 模板插件库

这组模板属于生成项目本身，依赖也安装在 `@agent-ui/example-agent-frontend`，不依赖 `@agent-ui/creator`。

当前模板：

- `antd-x-theme-provider`：通过插件服务注册表提供 `agent-ui.theme` 能力，不直接渲染 UI。
- `antd-x-theme-switch`：声明 `inject: ["agent-ui.theme"]`，调用另一个插件暴露的主题函数。
- `antd-x-conversations`：用 `Conversations` 展示历史会话，并提供独立的 `agent-ui.conversations` Service seam；真正的创建、重命名、删除仍属于 Runtime。
- `antd-x-new-conversation`：调用 `context.actions.startNewConversation()` 创建新的 AG-UI thread；按钮本身不持有 Agent Runtime，也不依赖历史会话插件。
- `antd-x-welcome`：用 `Welcome` 展示 Agent 身份与共享运行状态。
- `antd-x-message-list`：可选探测 `agent-ui.conversations` Service；存在时过滤当前历史会话，不存在时直接渲染 Runtime 的全部消息。使用 `Bubble.List`、`Actions.Copy`、`FileCard`、`Sources` 呈现内容；没有反馈提交合同前不伪造点赞/点踩。
- `antd-x-run-timeline`：同样可选探测会话 Service，再用 `Think` 和 `ThoughtChain` 映射 AG-UI reasoning、activity、tool call 与 tool result；没有历史会话插件时仍展示当前 Runtime 的完整执行链。
- `antd-x-tool-detail`：独立工具调用详情面板，可按 `toolCallId` 定位调用，并展示增量参数的最终投影、执行状态、结果或错误；用于右侧 Inspector 等独立 Slot。
- `antd-x-reasoning`：只渲染当前会话的 AG-UI reasoning messages，适合需要独立思考区域但不需要完整执行链的布局。
- `antd-x-activity-feed`：只渲染 AG-UI activity messages，并把业务状态投影为 loading / success / error / abort。
- `antd-x-sources`：聚合当前会话 message metadata 与 Frontend State 中的 sources，形成可独立放置的引用面板。
- `antd-x-attachments`：聚合当前会话输入与 Frontend State 中的附件，仅做只读展示；在 Runtime 提供多模态发送合同前不开放上传入口。
- `antd-x-resources`：用 `Folder`、`CodeHighlighter`、`FileCard`、`Sources` 与 `Mermaid` 展示项目文件、产物、引用和图表。
- `antd-x-prompts`：用 `Prompts` 提供可配置且可直接发送的快捷提示。
- `antd-x-sender`：用 `Sender` 和 `Suggestion` 发送消息、唤出快捷指令，并在运行期间提供停止操作。

`index.ts` 导出的 `antdXTemplatePlugins` 是开发期 catalog，可用于预览整套模板。生产入口的 `plugins/index.ts` 只转出 `registry.generated.ts`；目标项目的 `generate:registry` 根据 AppUIModel 引用和各插件 manifest 生成显式静态 import，不能展开整个 catalog。这样未选择的 Plugin 才能从静态 import graph 和 Bundle 中消失。模板只消费 `UIPluginContext`，不会创建或持有 Agent Runtime。布局、顺序和实例 props 都由 `app-ui/app-ui.json` 决定。主题硬依赖和可选会话能力都通过稳定 Service name 关联 Provider 与 Consumer；Consumer 不导入具体 Provider 源码。

没有机械包装全部 Ant Design X 组件：`Notification` 会触发系统通知权限；附件插件也明确保持只读，因为当前 `sendMessage` 仍是字符串输入。HITL 审批、Generative UI 和附件上传需要先有 Runtime action / renderer contract，在合同补齐前不伪装成可用能力。聚合插件与细粒度插件可以同时存在于开发期 catalog，但生成项目的生产 Registry 只显式导入 AppUIModel 实际选择的插件。
