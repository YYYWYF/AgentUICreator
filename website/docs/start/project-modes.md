---
title: 创建助理界面
description: 在 Creator 中选择模板、填写源码位置并初始化。
---

# 创建助理界面

## 1. 打开 Creator

打开自己的开发页面，点击右上角的 **Creator Agent**。展开后，右侧会出现「创建 Agent UI」面板。

![点击右上角的 Creator Agent，展开创建面板。](/images/start/03-creator-entry.png)

## 2. 选择模板并填写源码位置

在「选择产品形态」中点击需要的模板。第一次操作可以选择「工作台」，选中后卡片会显示蓝色边框和勾选标记。

| 模板 | 选择后的布局 |
| --- | --- |
| 工作台 | 助理占据完整工作区域，带会话列表和对话区 |
| 助手 | 通过悬浮入口打开或收起助理 |
| 嵌入式 | 将助理放在页面中的固定区域 |

在下方「Agent UI 源码位置」输入 `src/agent-ui`。检查绿色路径，确认生成位置在自己的工程内。

![选中工作台后，在源码位置填写 src/agent-ui，并检查下方路径。](/images/start/04-select-platform.png)

## 3. 初始化

点击面板底部蓝色的 **初始化 Agent UI** 按钮。

如果出现缺少依赖的提示，复制界面列出的安装命令，在工程终端中执行，再回到 Creator 重新检查。已有 React 和 UI Library 保持兼容的当前版本。

完成后，顶部会显示 **Agent UI 已创建**，工程的 `src/agent-ui` 目录中会出现生成文件。

![初始化完成后，面板顶部显示 Agent UI 已创建，右侧有查看接入方法。](/images/start/05-initialized.png)

点击右侧「查看接入方法」，然后继续[把助理放到页面中](./first-agent-ui)。
