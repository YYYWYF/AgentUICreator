---
title: "插件总览与选用"
---

# 插件总览与选用

本节按对话、输入、回复操作和结果展示介绍界面插件。通过 Creator 调整组合，也可以在项目已有组件文件中修改公开参数。

语言、用户资料、附件适配器等能力统一见[Agent 参数与配置](../integration/agent-options)；默认主题、历史服务与命令来源也按配置接入，不作为独立界面插件介绍。

先了解成品可以做到什么时，阅读[Agent 前端能力](../agent-ui/)。本章用于选择具体 Plugin，查看它的参数、组合方式和使用前提。

需要开发或修改插件功能时，先阅读[插件开发](./development)，了解状态、操作、事件、服务、生命周期、Slot 和渲染等可用能力，以及文件结构与修改位置。

## 按工作选择

| 工作 | 核心组合 |
| --- | --- |
| 基本对话 | conversation-surface → composer → submit-action。 |
| 回复操作 | response-footer + copy-action/reload-action/feedback-actions/export-markdown-action。 |
| 推理与工具 | reasoning、tool-group、tool-fallback、thinking-indicator、tool-timeline。 |
| 结构化结果 | 状态、计划、任务、文件、图表、来源与检索 renderer。 |
| 输入增强 | 附件、语音、引用、mention/slash trigger、可选 Lexical。 |
| 外观与账号入口 | 主题切换、语言切换、账号与登录界面。 |

## 如何加入现有项目

先查看当前页面是否已有该功能。已有功能直接调整参数和位置；新增功能从 Creator 当前可用的安装或组合入口选择，并核对服务前提。不是每个组件都能用一条同名安装命令添加。

下面是合并进现有 composer 节点的局部组合，不是可覆盖整个工程的完整模型：

```json
{
  "id": "composer-main",
  "pluginId": "composer",
  "enabled": true,
  "slots": {
    "submitAction": [
      {
        "id": "submit-action-main",
        "pluginId": "submit-action",
        "enabled": true
      }
    ]
  }
}
```

## 插件分类

下面的分类与左侧目录一致。每个插件只归入一个主要用途；预设是否启用，以当前项目实际配置为准。

### 对话与会话管理

| 插件 | 用途 | 当前三形态预设 |
| --- | --- | --- |
| [`conversation-surface`](./conversation-surface) | 会话主界面 | platform、assistant、embedded |
| [`conversation-thread-list`](./conversation-thread-list) | 历史会话列表 | platform、assistant、embedded |
| [`conversation-new`](./conversation-new) | 新建会话 | platform、assistant、embedded |
| [`conversation-suggestions`](./conversation-suggestions) | 开场建议 | platform、assistant、embedded |
| [`transient-assistant-messages`](./transient-assistant-messages) | 临时展示消息 | platform、assistant、embedded |

### 消息输入与编辑

| 插件 | 用途 | 当前三形态预设 |
| --- | --- | --- |
| [`composer`](./composer) | 输入框与操作组合 | platform、assistant、embedded |
| [`submit-action`](./submit-action) | 发送与停止 | platform、assistant、embedded |
| [`add-attachment-action`](./add-attachment-action) | 添加附件 | platform、assistant、embedded |
| [`dictation-action`](./dictation-action) | 语音输入 | 未列入，显式接入 |
| [`conversation-quote`](./conversation-quote) | 引用回复 | platform、assistant、embedded |
| [`mention-trigger`](./mention-trigger) | @ 提及入口 | 未列入，显式接入 |
| [`slash-command-trigger`](./slash-command-trigger) | / 快捷命令入口 | 未列入，显式接入 |
| [`lexical-composer-input`](./lexical-composer-input) | Lexical 输入框 | 未列入，显式接入 |
| [`lexical-edit-composer`](./lexical-edit-composer) | Lexical 消息编辑 | platform、assistant、embedded |

### 回复操作

| 插件 | 用途 | 当前三形态预设 |
| --- | --- | --- |
| [`response-footer`](./response-footer) | 回复底部操作区 | platform、assistant、embedded |
| [`copy-action`](./copy-action) | 复制回复 | platform、assistant、embedded |
| [`reload-action`](./reload-action) | 重新生成回复 | platform、assistant、embedded |
| [`feedback-actions`](./feedback-actions) | 回复反馈 | 未列入，显式接入 |
| [`export-markdown-action`](./export-markdown-action) | 导出 Markdown | platform、assistant、embedded |

### 思考、工具与任务

| 插件 | 用途 | 当前三形态预设 |
| --- | --- | --- |
| [`thinking-indicator`](./thinking-indicator) | 等待与思考提示 | 未列入，显式接入 |
| [`reasoning`](./reasoning) | 思考过程 | platform、assistant、embedded |
| [`tool-group`](./tool-group) | 工具组 | platform、assistant、embedded |
| [`tool-timeline`](./tool-timeline) | 工具执行时间线 | 未列入，显式接入 |
| [`tool-fallback`](./tool-fallback) | 通用工具与审批 | platform、assistant、embedded |
| [`task-group`](./task-group) | 任务组 | 未列入，显式接入 |
| [`agent-status-message`](./agent-status-message) | Agent 状态卡片 | 未列入，显式接入 |
| [`agent-plan-message`](./agent-plan-message) | Agent 计划 | 未列入，显式接入 |
| [`job-progress-message`](./job-progress-message) | 任务进度 | 未列入，显式接入 |

### 结果、来源与检索

| 插件 | 用途 | 当前三形态预设 |
| --- | --- | --- |
| [`generated-file-message`](./generated-file-message) | 生成文件 | 未列入，显式接入 |
| [`chart-message`](./chart-message) | 图表消息 | 未列入，显式接入 |
| [`source-citations-message`](./source-citations-message) | 来源引用 | 未列入，显式接入 |
| [`retrieval-chunks`](./retrieval-chunks) | 检索片段 | 未列入，显式接入 |
| [`web-search`](./web-search) | 网页搜索 | 未列入，显式接入 |
| [`context-retrieval-message`](./context-retrieval-message) | 上下文检索消息 | platform、assistant、embedded |

### 外观、语言与账号

| 插件 | 用途 | 当前三形态预设 |
| --- | --- | --- |
| [`agent-identity`](./agent-identity) | Agent 名称与标识 | platform、assistant、embedded |
| [`theme-switch`](./theme-switch) | 主题切换 | 未列入，显式接入 |
| [`locale-switch`](./locale-switch) | 语言切换 | 未列入，显式接入 |
| [`auth-gate`](./auth-gate) | 登录门禁 | 未列入，显式接入 |
| [`auth-account`](./auth-account) | 账号入口 | 未列入，显式接入 |

## 选择前检查

保留组件原有交互与组合，避免出现重复按钮或没有数据的卡片。附件、语音、认证、反馈和历史恢复分别需要业务服务，不能仅凭启用组件认定已完成接入。

所有正文示例以当前公开 API 和应用模板为依据，未把尚无正式发布历史的仓库版本标成正式支持起点。源码接管/同步先阅读[所有权](../customization/source-takeover)和[更新](../updates/)。

![本项目对话界面组合演示](/images/plugins/conversation-surface.png)

本项目本地 Mock 演示。各插件页面按实现来源展示 assistant-ui 上游示例或本项目组件截图；上游示例的样式不代表当前工程的最终外观。
