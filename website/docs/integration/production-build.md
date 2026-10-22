---
title: 独立构建与生产部署
---

# 独立构建与生产部署

生产只需要前端工程、实际使用的 Core/Renderer/Runtime/Plugins 等生产依赖及业务 API。Creator、更新服务和 Mock 留在开发环境。

## React 构建

1. 确定生产 endpoint、历史服务、认证和资源 base。
2. 运行工程已有检查脚本，再执行自己的构建。
3. 按业务发布流程部署静态目录。
4. 从正式访问路径检查流式、工具、错误、取消和资源加载。

```sh
pnpm test
pnpm typecheck
pnpm build
```

命令以实际脚本为准。不要要求目标工程使用仓库 Workbench。生产配置不读取工具私密 `.env.agentui.local`，不导入 Creator 子路径。

## Web Component 构建

先在 producer 构建桥接 ESM 资源，再发布到 consumer 使用的位置，consumer 运行自己的 build。记录资源摘要或版本，避免缓存旧文件。

官方 classic 资源和项目 ESM 输出使用不同加载方式。子目录部署同时检查模块 URL、静态 base、API 地址和刷新路径。

## 内网部署

在受控环境使用工程自己的 registry、证书和包管理流程准备生产依赖、锁文件及传递依赖。可在具备所需网络访问的构建环境生成静态产物，再按企业流程交付到部署环境；只部署已构建资源时，无需在目标静态服务器安装 Creator。

确认业务 AG-UI、历史、附件及认证接口从实际用户网络可达，并将字体、脚本和其他静态资源按需部署到内网。Vue/HTML 使用的 Web Component 资源也需一同交付。Windows 上沿用工程已有的构建命令与发布流程，路径包含空格时正确引用，避免引入依赖 Unix shell 的部署脚本。

Creator 的平台包、模型地址及离线工具安装属于[开发环境配置](../guide/windows-and-offline)，与生产静态站点分别准备。

## 独立性与验收

在干净环境检查生产依赖与产物，确认无 Creator 模块、工具端口、Mock 和 Node fs/crypto 进入浏览器依赖图。检查是否误包含模型密钥；不要把秘密原文打印到验证日志。

真实服务验收不能由 Mock 替代。保留部署记录与旧资源，回退遵循业务发布流程；依赖恢复与源码同步分别处理。

> 截图待补：构建结果、静态产物，以及关闭 Creator 后仍可对话的生产页面和业务 API。
