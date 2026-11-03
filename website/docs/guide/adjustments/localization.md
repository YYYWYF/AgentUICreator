---
title: "语言与文案定制"
---

# 语言与文案定制

把要替换的文字和中英文内容直接告诉 Creator。本页记录 2026 年 10 月 27 日的实际测试，没有向它提供代码位置或参数名称。

## 本次怎么说

> 把输入框提示改成“请输入你的业务问题”，英文改成“Ask a business question”。屏幕阅读器读到的输入提示也一起改，输入和发送的用法保持不变。

![本轮实际发送的文案需求。](/images/guide/examples/20261027/locale-request.png)

## Creator 实际怎样处理

Creator 自行找到输入框文案和可访问标签的接入位置，修改了四份项目文件，代码检查通过。它说明本次没有实际测试屏幕阅读器播报。

![Creator 的实际修改总结和检查回执。](/images/guide/examples/20261027/locale-reply.png)

## 页面检查结果

实际打开页面后，中文占位提示和输入框的可访问标签都变成了“请输入你的业务问题”。

![本轮修改后的中文输入提示。](/images/guide/examples/20261027/locale-chinese.png)

切换英文，两处文字都变成了“Ask a business question”。本轮还输入了一段草稿再切换语言，草稿保留；随后实际发送了一条消息，正常收到示例回复。

![本轮修改后的英文输入提示。](/images/guide/examples/20261027/locale-english.png)

这里核对的是实际页面和可访问标签，**未使用真实屏幕阅读器检查朗读效果**。界面语言也不决定 Agent 的回答语言。

需要自己编写代码时，见[开发文档](/development/styling-and-localization)。
