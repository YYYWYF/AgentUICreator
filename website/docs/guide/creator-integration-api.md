---
title: "Creator 开发环境接入选项"
---

# Creator 开发环境接入选项

本页用于比较 Creator 的启动入口，并查询各 Dock 通用选项。逐步安装与操作使用表中的专页；模型、文件事务和工具内部服务无需自行组装。

## 选择入口

| 方式 | 适用场景 | 操作指引 |
| --- | --- | --- |
| CLI 独立页 | 不想改业务开发配置。 | [独立运行](./creator-standalone) |
| Vite Dock | 希望在业务页面展开工具。 | [Vite 接入](./creator-dock-vite) |
| Rsbuild Dock | 使用 Rsbuild 的业务工程。 | [Rsbuild 接入](./creator-dock-rsbuild-webpack) |
| Webpack Dock | 使用 Webpack 5 的业务工程。 | [Webpack 接入](./creator-dock-rsbuild-webpack) |

启动参数见 [Creator CLI](./cli)，配置字段见[环境变量与配置项](./configuration)。

## Dock 常用选项

| 选项 | 作用 |
| --- | --- |
| `creatorUrl` | Creator 终端显示的服务地址。与 CLI 显式端口一致。 |
| `projectRoot` | 当前开发页面对应的工程目录，避免不同工程入口混用。 |
| `locale` | 工具界面语言 `zh-CN` 或 `en-US`。 |

保留业务原有插件。第一次修改开发配置要重启，之后启停工具的效果由所选适配器决定。没有配置入口的已有页面不会自动出现按钮。

## 配置生效与移除

模型配置放在工具配置目录，通过 `--config-root` 选择；切换工程不自动切模型密钥。生产配置不加载工具入口。希望移除 Creator 后普通开发仍可用时，用 Vite 教程的可选加载写法。

## 验证结果

确认工具启用时出现在正确工程，收起后业务界面可继续使用，停止工具不停止业务服务，生产产物无工具脚本。端口占用或连接失败按[连接排障](../troubleshooting/creator-connection)处理。

> 截图待补：三种构建工具中的入口与启停效果，标注对应工程和实际端口。
