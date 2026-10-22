---
title: Windows 与内网开发环境
---

# Windows 与内网开发环境

本页说明 Creator 在 Windows 和企业内网中的安装、启动与网络准备。生成应用的静态资源和业务接口部署见[构建与生产部署](../integration/production-build#内网部署)。

## Windows 路径与启动

使用受支持的 Node.js 和工程现有的包管理器。含空格或中文的路径加双引号，例如：

```sh
agent-ui-creator --project "C:\work\Agent Demo"
```

正常安装 Creator 后即可启动，无需额外准备 Python 环境。缺少运行组件时，检查安装是否完整、是否跳过可选依赖，以及镜像是否同步了当前平台所需文件。开发脚本使用工程已有的跨平台方式，避免依赖 Bash 环境赋值或 Unix 可执行路径。

## 内网安装与证书

沿用企业 `.npmrc`、scope registry、认证和证书配置。准备 Creator 主包、对应平台辅助包及锁定的传递依赖；只复制一个主 tarball 不构成完整离线安装。

在受控联网环境准备对应平台、版本与锁文件的制品或缓存，再按既有包管理流程安装。更新发现使用实际 registry；元数据不可达时查看缓存或离线状态，不能据此判定已是最新版本。证书问题通过企业证书配置解决。

## 模型与开发服务

模型调用、业务 Agent 连接和工具依赖安装使用不同的网络入口，需分别确认可达。模型服务按[模型配置](./model-configuration)设置内网地址；业务 Agent 按[服务连接](../integration/connect-agent)配置。

离线安装不代表已经具备离线模型服务。没有可用模型时，仍可浏览文档和静态页面，但 Creator 无法完成 AI 编码任务。

完整静态文档可以发布到内网，Markdown 与 llms 索引可以导入本地知识库。

> 截图待补：Windows 中文路径启动、平台包身份及内网/离线状态，隐藏企业地址和凭据。

平台证据见[兼容矩阵](../updates/compatibility)，安装或启动故障见[启动排障](../troubleshooting/startup)。
