---
title: 在 Vite 页面接入 Creator
---

# 在 Vite 页面接入 Creator

Dock 在业务开发页面显示入口，Creator 单独运行。完整配置见[安装并启动](../start/install-creator)，这里解释运行与边界。

## 配置一致的端口

保留已有 `dev` 和 `build`，新增开发脚本：

```json
{ "scripts": { "dev:creator": "agent-ui-creator --project . --port 47833 --no-open" } }
```

在 Vite 开发分支加载 `/dock/vite`，调用 `createCreatorDockVitePlugin({ creatorUrl: 'http://127.0.0.1:47833' })`。生产分支不导入 Creator。需要卸载工具后仍可普通开发时，使用入门教程的 `import.meta.resolve` 可选加载。

初次改 Vite 配置需重启。之后按需启停 Creator，业务服务独立。显式端口占用会报错，改端口时同时改 `creatorUrl`。

## 工程与配置身份

适配器携带开发页面的工程身份，只在当前选择匹配时显示入口。`projectRoot` 可明确路径；Vite 会结合自己的 root，不要指到其他仓库。切换 Creator 到另一工程后，原页面入口可能隐藏。

`locale` 可配置工具语言。模型密钥从工具配置目录读取，不通过 Vite 公开环境字段传入页面。

## 启停检查

Vite 适配器支持检测工具启停；收起入口保留 iframe 会话。停止 Creator 后业务页面仍运行。生产构建检查 HTML 和依赖图中没有 Dock、工具 API 或 Mock。

> 截图待补：工具未启动、已启动、展开及停止后业务仍运行的状态。

失败时见[入口连接排障](../troubleshooting/creator-connection)。
