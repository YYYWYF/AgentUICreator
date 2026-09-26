# Creator 本机 Mock Agent 开发服务

Creator 工作台顶部的 **Mock Agent** 入口控制一个独立的本机 HTTP 服务。它与 Creator 控制接口、用户项目的开发服务器使用不同端口。用户项目无需安装 Mock 包或修改 Vite 配置。

## 使用

1. 打开 Mock Agent 面板，点击“启动服务”。服务绑定 `127.0.0.1`，由系统分配可用端口。
2. 复制面板显示的实际 AG-UI 地址，如 `http://127.0.0.1:58081/agent`。
3. 在用户项目接入处配置 `<Agent endpoint="地址" />`，或配置前端环境变量 `VITE_AGENT_ENDPOINT=地址`。环境变量方式需要重启用户项目的开发服务器；不要填写到 Creator 的 `.env.creator.local`。
4. 在面板选择预置 Demo 和播放时长倍率，然后在已接入的 Agent UI 中发送消息。Demo 是预设事件流，不会理解或执行用户的自然语言要求。
5. 点击“停止服务”停止所有 Mock 流并释放端口。再次启动后复制新地址。

面板控制服务和场景，并在用户点击引入按钮时安装所需前端插件；不会创建额外的 Conversation Runtime，也不自动更改用户项目 endpoint。关闭面板不会停止服务，重新打开会读取当前状态；退出 Creator 开发服务器时服务停止。服务状态和 Demo 选择属于当前 Creator 开发服务器，不随项目切换重建，不持久化到生成项目。

## 接口与生命周期

- Creator 控制接口：`GET /__agent-ui/creator/mock` 与 `/compatibility`；`POST` 同路径下的 `/start`、`/stop`、`/select`、`/install-plugin`。
- 独立 Mock 服务：`POST /agent`，使用标准 AG-UI RunAgentInput 和 SSE 事件；`GET /agent/scenarios` 返回预置场景目录。
- `/select` 接受 `{ "scenarioId": "simple-chat", "speed": 1 }`。倍率乘以预设等待时长，0 代表立即完成。选择默认用于后续请求，不改变进行中的事件流。
- 独立服务也支持 `?scenario=...&speed=...` 指定固定场景。这些显式参数优先于面板当前选择。
- 服务仅绑定本机地址，允许 `localhost`、`127.0.0.1`、`[::1]` 的 HTTP/HTTPS 开发页面跨端口访问，支持 OPTIONS 预检，不接受外部网站 Origin。
- Creator 持有该 HTTP 服务；启动/停止串行执行，重复启动返回同一实例，退出后不能重新启动已释放的实例。

## 所有权

Creator 在开发期依赖 `@agent-ui/mock-agent`，复用已有场景目录和 HTTP SSE handler。Mock 不依赖 Python Creator Agent 的运行状态。生成项目仅通过标准 AG-UI API 连接开发服务，生产构建和运行不依赖 Creator 或 Mock 服务。接入真实 Agent 时替换 endpoint 即可。
## Demo 与前端能力

图表、Job Progress、AgentPlan、AgentStatus 都有独立的可选展示资源。缺失时，Demo 卡片内提供对应的引入按钮；完成后通过同一 Conversation Runtime 展示。卡片右侧的效果示意图可以点击放大，预览不会安装资源或启动请求。子任务资源同样支持卡片内引入。模板不默认安装这四种扩展资源。

初始化模板提供基础会话，不默认安装图表插件。Mock Demo 只发送模拟 AG-UI 数据，不会自动修改用户项目。

Mock 面板检查当前选中项目的插件源码和 AppUIModel。图表 Demo 缺少插件时显示“当前项目缺少图表插件”；已安装但没有启用时显示“当前项目未启用图表插件”。子任务 Demo 同样检查任务卡片插件。无法读取项目时明确显示无法检查，不把它当成已支持。

需要图表时，在图表 Demo 的缺失提示旁点击“引入图表”。Creator 宿主通过 Source Registry 安装 `plugin/chart-message`，生成插件注册，再通过 AppUIModel 事务启用它；无需发起对话。已安装但停用时显示“启用图表”。成功后提示消失，可以在 Agent UI 中发送消息测试。自然语言引入仍可使用。公共 Data Message 注册入口属于前端基础设施，保留在模板中。

一键引入通过宿主的 `installMockPlugin` 适配器接入现有项目工具，使用当前项目标识校验和串行操作，阻止切换项目后写入错误目标。操作不会修改用户 endpoint，不会覆盖定制插件，失败时显示原因并允许重试。未配置适配器的 Creator 宿主会明确提示不可用。

开发时安装或升级资源会跳过内容未变的源码文件，避免基础版本升级触发无关模块的连续热更新。模板的组合状态模块会在 Vite 热更新期间保留上一份有效 snapshot；新组合完成加载和验证后才替换当前画面。生产构建仍独立运行，不依赖此开发期机制。
