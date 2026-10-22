---
title: Agent 参数与配置
---

# Agent 参数与配置

本页帮助你判断一项应用设置应该传给 `Agent`、写进项目配置文件，还是接入业务服务。首次挂载见 [React 接入](./react)，完整类型见 [React Host API](./react-host-api)。

## 页面传入的参数

在业务页面导入生成的 `Agent`，传入当前需要的配置：

```tsx
import { Agent } from './agent-ui';

export function Chat() {
  return <Agent endpoint="/api/agent" locale="zh-CN" theme="violet" />;
}
```

| 参数 | 用途 |
| --- | --- |
| `endpoint` | 业务 AG-UI 服务地址。 |
| `theme` / `onThemeChange` | 界面主题，支持 `light`、`dark`、`violet`，以及用户切换主题的回调。 |
| `locale` / `onLocaleChange` | 当前界面语言及切换回调。 |
| `user` | 用户名称、头像等展示资料，不是认证凭据。 |
| `attachmentAdapter` | 接入项目的附件准备与上传。 |
| `dictationAdapter` | 接入项目的语音识别。 |
| `feedbackAdapter` | 接入项目的回复评价服务。 |
| `initialThreadId` | 初始化时打开已有会话。 |
| `runResumeProvider` | 为已有会话提供业务运行恢复能力。 |
| `transientMessages` | 提供页面内临时提示服务，不写入持久历史。 |
| `onError` | 处理应用或 Agent 运行错误。 |
| `observability` | 接收项目运行诊断与组合观察结果。 |

参数以当前生成入口的 `AgentProps` 为准。页面使用 `AgentUIProvider` 管理会话时，将配置传给外层 Provider，内部使用 `<Agent />` 显示界面。

## 切换主题

直接传入 `theme="light"`、`theme="dark"` 或 `theme="violet"` 即可设置主题。参数变化时保留当前会话和输入草稿；主题只影响界面，不发送给 Agent 服务。

不传 `theme` 时沿用项目默认主题，并允许已有主题切换控件更新它。传入 `theme` 后，由业务页面控制当前值；同时使用主题切换控件时，通过 `onThemeChange` 接收用户请求并更新该值：

```tsx
import { useState } from 'react';
import { Agent, type AgentUITheme } from './agent-ui';

export function Chat() {
  const [theme, setTheme] = useState<AgentUITheme>('violet');
  return <Agent theme={theme} onThemeChange={setTheme} />;
}
```

页面使用外层 `AgentUIProvider` 时，把这两个参数传给该 Provider，内部保留 `<Agent />`。

## 项目文件中的设置

| 设置 | 当前入口 |
| --- | --- |
| 默认主题 | `agent-ui/theme/theme-config.ts`，见[默认主题配置](../customization/default-theme)。 |
| 默认语言 | `agent-ui/i18n/locale-config.ts`；页面受控切换见[界面语言配置](./locale-configuration)。 |
| 历史服务地址 | `agent-ui/conversation/config/conversation-runtime-config.ts`，见[地址配置](./history-endpoint)。 |
| `/` 命令与 `@` 候选 | 项目的来源服务，见[命令来源配置](../customization/command-source)与[提及扩展](../customization/mention-and-commands)。 |

路径相对于生成的 Agent UI 源码目录。保留配置文件原有类型与其他字段；当前 React `Agent` 没有 `conversationDataEndpoint` 参数。

## 接入相应服务

- 语言由业务页面管理时，按[界面语言与受控切换](./locale-configuration)同步当前值和回调。
- 重新打开会话或恢复运行时，按[会话配置](./conversation-binding)接入，历史数据要求见[服务契约](./history-backend)。
- 添加附件、语音或评价功能时，将实际实现的[业务适配器](./attachments-dictation-feedback)传给 Agent，并组合相应控件。
- 业务按钮需要发送、停止或新建对话时，使用[业务页面联动](./react-host-control)。

按钮、展示资料和配置入口各有职责：传入用户头像不建立登录身份，显示上传按钮也不提供上传服务。实际认证见[认证与网络](./authentication-and-network)。

> 截图待补：参数、配置文件与对应界面的关系，标注需要额外服务的入口。
