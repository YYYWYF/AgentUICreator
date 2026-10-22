---
title: 用 AI 修改界面
---

# 用 AI 修改界面

## 1. 填写模型配置

在工程根目录新建 `.env.agentui.local`，填入自己的模型服务配置：

```dotenv
MODEL_PROVIDER=openai
MODEL_BASE_URL=https://your-model-service.example/v1
MODEL_API_KEY=your-api-key
MODEL_NAME=your-model-name
```

将示例地址、密钥和模型名替换为实际值。在 `.gitignore` 中加入一行 `.env.agentui.local`，保存后重启 Creator。

这些密钥只供开发工具使用，不要加 `VITE_` 前缀或写入页面代码。

## 2. 打开 Creator 的输入框

回到开发页面，点击右上角 **Creator Agent**。找到右侧面板底部的输入框，图中占位提示以「例如：看看当前 UI」开头。

![右侧 Creator 面板底部是修改需求输入框，右下角有发送按钮。](/images/start/05-initialized.png)

在这里输入要做的修改，例如：

> 将助理的品牌色改为蓝色，保留现有布局。

点击右下角 **发送**。Creator 会在上方显示执行过程；需要你回答问题或确认方案时，按面板提示操作。

## 3. 查看修改结果

执行完成后，查看本次代码改动。收起 Creator，回到页面助理中检查颜色、布局和交互，再运行工程原有的检查命令。

请求失败时，先检查模型服务地址、模型名和密钥。OpenCode 服务提示缺少 `x-opencode-session` 时，在配置文件中增加 `CREATOR_MODEL_OPENCODE_SESSION_HEADER=1` 并重启 Creator。
