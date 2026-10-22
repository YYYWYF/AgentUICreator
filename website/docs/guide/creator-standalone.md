---
title: 独立运行 Creator
---

# 独立运行 Creator

不接 Dock 时，可以直接用 CLI 打开独立工具页选择工程。目标页面仍由自己的开发服务提供。

```sh
agent-ui-creator --project "C:\work\my-app" --config-root "C:\work\tool-host"
```

不传 `--project` 时在界面选择，工具不会自动选仓库示例。`--no-open` 禁止自动开浏览器，可手动访问终端地址。按 Ctrl+C 停止。

## 日常使用

在独立页中打开工程，确认路径后初始化或继续修改。需要检查效果时，打开业务工程自己的开发地址；工具不替你启动业务服务。

模型配置来自 `--config-root`，与当前选中工程分别管理。希望在业务页面直接展开工具时，使用对应 Dock 接入，不需要自行组装底层 API。

## 安装与停止

正常安装后直接启动，无需额外准备 Python 环境。安装缺组件时按[启动排障](../troubleshooting/startup)检查。结束开发时分别停止 Creator 与业务服务，生产页面不需要运行 Creator。

> 截图待补：独立工具页打开真实工程，另一个窗口显示业务预览，标明独立进程与端口。

其他方式见[开发环境接入选项](./creator-integration-api)和[启动排障](../troubleshooting/startup)。
