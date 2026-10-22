---
title: 开始使用
description: 跟着截图，在自己的工程中添加并使用 AI 助理。
---

# 开始使用

本教程带你完成安装、初始化、页面挂载和第一轮对话。想先判断成品是否满足需求，可阅读[前端能力概览](../agent-ui/)；已有 Agent UI 的工程可直接进入 [Creator 开发指南](../guide/)或[应用接入与部署](../integration/)。

## 第一步：安装 Creator

:::tip 环境要求
Node.js `^20.19.0 || >=22.12.0`。以下步骤使用 React + Vite 工程，命令以 pnpm 为例；包管理器沿用工程现有配置。
:::

打开自己的工程，在根目录安装 Creator：

```sh
pnpm add -D @za38.03/agent-ui-creator
```

按[安装与启动配置](./install-creator#2-启动工具)添加启动脚本和 Vite 插件，启动 Creator 并重启工程开发服务器。

页面右上角会出现 **Creator Agent** 按钮。点击它，展开工具面板。

![点击页面右上角的 Creator Agent 按钮。](/images/start/03-creator-entry.png)

## 第二步：创建助理界面

在展开的面板中，找到「创建 Agent UI」：

1. 点击「工作台」卡片，选中后右侧会出现勾选标记。
2. 在「Agent UI 源码位置」中填写 `src/agent-ui`。
3. 确认下方绿色路径指向自己的工程，再点击底部「初始化 Agent UI」。

![在右侧面板选择工作台，填写源码位置，点击初始化 Agent UI。](/images/start/04-select-platform.png)

如果提示缺少依赖，按界面列出的命令安装，再重新检查。完成后，面板会显示「Agent UI 已创建」。

## 第三步：把助理放到页面中

点击「Agent UI 已创建」右侧的 **查看接入方法**，展开组件导入说明。

![在初始化完成的卡片右侧点击查看接入方法。](/images/start/05-initialized.png)

按[页面接入步骤](./first-agent-ui)导入生成的 `Agent` 组件，把它放到需要显示助理的位置，并给容器设置高度。

回到页面，看到会话列表、开场建议和底部输入框，就完成了界面接入。

![接入后的助理：左侧是会话列表，右侧是对话区，底部是消息输入框。](/images/start/06-platform-mounted.png)

## 第四步：发送第一条消息

先[配置演示对话服务](./first-agent-ui#2-配置演示对话服务)，或填入自己的 AG-UI 接口地址。

收起 Creator 面板，在页面助理底部的「发送消息…」中输入：

> 请演示一次思考、工具执行和最终回复。

点击输入框右下角的向上箭头发送。使用演示服务时，会依次看到思考、工具执行和最终回复，如下图。

![发送消息后，对话区显示思考、工具执行记录和最终回复。](/images/start/07-demo-conversation.png)

想继续调整颜色、布局或组件时，按[用 AI 修改界面](./ai-assisted)配置模型，再把修改要求发给 Creator。

> 截图待补：按步骤对应的操作截图。使用当前实际工程，保留操作入口和预期结果。
