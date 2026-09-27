# A2UI 官方资源

A2UI 是 AgentUICreator 提供的官方资源。安装后，Agent 前端可以渲染 A2UI Surface、处理 A2UI Action，并衔接 AG-UI Activity 事件。

在 Creator 的 Mock Agent 面板选择 **A2UI · Interactive Order Card** 或 **A2UI · Form Controls**，点击 **安装 A2UI 资源**。Creator 自动补齐所需依赖、安装资源并生成项目文件。资源已就绪后，点击 **运行场景**。

将 Mock 服务地址配置到前端项目的 `VITE_AGENT_ENDPOINT`，重启前端开发服务，再发送一条消息播放场景。生产应用继续连接自己的 Agent API，并独立构建和部署。

资源的稳定 ID 是 `a2ui`。Scenario 只需声明：

```ts
resources: ["a2ui"]
```

如果当前项目已有不兼容的依赖，Creator 会显示资源兼容性冲突，不会静默升级项目已有的直接依赖。需要排障时，主动打开 **查看技术详情**。安装失败可以重试；重新打开 Creator 后会重新检查资源状态。
