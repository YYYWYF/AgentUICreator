---
title: "语言与文案定制"
---

# 语言与文案定制

本页于 2026 年 11 月 6 日使用当前 Creator 和 `deepseek-v4.1-flash`，在招行 AI 工作台中重新执行。工作台保持左侧聊天、右侧会话列表。

## 启用语言切换

在 Creator 输入 `/enable locale`，选择“切换界面语言”。本轮确认补齐项目应用文件后，让 Creator 将它放在现有主题切换的同一操作区。项目校验通过，页面可以切换中文和英文。

## 本次怎么说

> 请修改当前工程 application/locales.ts 中已有的中英文覆盖：composer.placeholder 和 composer.input 两个字段，中文都设为“请输入你的业务问题”，英文都设为“Ask a business question”。该文件的完整位置是 src/agent-ui/application/locales.ts。保留已有小招名称、欢迎语和推荐问题，保留当前语言切换、草稿、输入和发送行为，不改布局。直接完成这两处文案覆盖并校验。

本轮补充了已确认的项目文案入口和字段；Creator 负责实际修改与校验。只描述目标文字时，也应把中文、英文和需要一起调整的可访问名称说清楚。

## Creator 实际怎样处理

Creator 在现有项目文案中补充这两个字段的双语覆盖，保留名称、欢迎语和推荐问题。只修改一份文案文件，类型检查和修改校验通过。

![输入文案修改完成后的真实回执。](/images/guide/examples/20261106/locale-reply.jpg)

## 页面检查结果

中文占位提示与可访问名称均为“请输入你的业务问题”：

![实际中文输入提示，右侧会话列表保持不变。](/images/guide/examples/20261106/locale-chinese.jpg)

英文两处均为“Ask a business question”：

![实际英文输入提示与对应英文欢迎内容。](/images/guide/examples/20261106/locale-english.jpg)

本轮输入“请保留这段草稿”，依次切换英文、中文、英文，草稿均保留；清空这段测试草稿后，又实际发送了一条问题并收到 Mock 回复。当前会话也在切换中保留，业务工作台自身仍显示中文。

这里核对了实际页面和可访问标签，没有使用真实屏幕阅读器检查朗读效果。界面语言切换不会改写录制中的演示回复内容。

需要自己编写代码时，见[样式与文案开发](/development/styling-and-localization)。
