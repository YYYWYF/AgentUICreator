---
title: 界面开发
description: 使用 Creator 描述需求、修改 Agent 前端，并在项目页面验证结果。
---

# 界面开发

Creator 根据你的需求检查和修改 Agent 前端工程。你可以调整布局、主题和组件，也可以先讨论方案，再决定是否实施。修改后，在项目页面检查效果；需要测试流式回复、工具调用等状态时，进入[模拟联调](./mock/)。

本章从启动配置、工程任务到结果管理介绍日常开发；模拟联调提供预设后端响应。首次创建与挂载界面按[快速上手](../start/)操作。

## 准备开发环境

先完成[安装并启动 Creator](../start/install-creator)和[创建助理界面](../start/project-modes)，并启动工程自己的开发页面。

点击页面右上角的 **Creator Agent** 展开面板，在顶部文件夹菜单核对当前工程和源码目录。已有多个工程时，按[工程管理](./project-selection)切换到本次要修改的项目。

开发入口按工程选择 [Vite](./creator-dock-vite)、[Rsbuild / Webpack](./creator-dock-rsbuild-webpack) 或[独立运行](./creator-standalone)。Windows 和企业内网的安装准备见[开发环境说明](./windows-and-offline)。

![右侧 Creator 面板：顶部确认工程，底部输入开发需求。](/images/start/05-initialized.png)

首次使用，在 Creator 配置目录的 `.env.agentui.local` 中填写模型服务：

```dotenv
CREATOR_MODEL_BASE_URL=https://your-model-service.example/v1
CREATOR_MODEL_API_KEY=replace-with-your-key
CREATOR_MODEL_NAME=replace-with-your-model
```

将示例值替换为实际配置，把文件加入 `.gitignore`，保存后重启 Creator。配置目录默认是启动目录；使用独立工具宿主时，见[模型配置](./model-configuration)。密钥只供开发工具使用，不加 `VITE_` 前缀，也不写入页面代码。

## 描述需求并实施

在 Creator 底部输入框说明要改的区域、预期效果和需要保留的行为。例如：

> 缩小会话列表的宽度，让对话内容有更多空间。保留列表搜索、新建会话和消息交互，窄屏下不能出现横向滚动。

按 **Enter** 发送，按 **Shift + Enter** 换行。Creator 会结合当前工程选择检查、编辑和验证方法。

尚未确定方案时，可以先提出只读请求：

> 检查当前布局和已启用的 Plugin，给出调整侧栏的方案与影响范围，先不要修改文件。

收到建议后，再说明采用哪个方案。更多示例见[需求与方案](./ask-and-inspect)和[修改界面](./request-changes)。常用主题与资源操作也可通过输入 `/` 打开[快捷命令](./commands)。

执行活动显示在对话区。需要补充信息或确认变更时，阅读问题卡片的对象和范围后回答；源码接管、依赖升级等操作应核对各自的具体计划，见[变更确认](./confirmations)。需要中止时点击「停止执行」，随后检查已保留的修改；详细处理见[进度与中断](./progress-and-cancel)。

## 验证效果并继续调整

执行完成后，先查看文件差异与检查结果，再收起 Creator，回到项目页面检查本次改动。

1. 核对修改范围，确认原有定制和需要保留的交互仍然有效。
2. 检查目标区域的布局、文案、窄屏表现；涉及消息状态时，用[模拟联调](./mock/)覆盖相应场景。
3. 按工程实际提供的脚本运行 `test`、`typecheck` 和 `build`。

回执中的静态检查结果与实际页面效果需要分别确认。失败项或未验证项的处理见[验证回执](./receipts-and-validation)，页面未更新时见[预览与接入](./preview-and-integration)。

需要继续调整时，在原会话中说明剩余问题和应保留的改动。支持撤销的运行可在回执中[撤销或重新应用](./undo-redo)。开始无关任务时，可以[清空 Creator 会话](./conversation-lifecycle)；清空会话会保留工程文件。

工具语言和设置见[Creator 设置](./settings-and-language)。开发完成后，按[独立构建与部署](../integration/production-build)发布前端应用。
