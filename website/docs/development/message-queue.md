---
title: "消息排队"
description: 启用 Composer 后续消息队列，理解发送、停止、审批和会话切换时的行为。
---

# 消息排队

开启后，用户可以在 Agent 回复期间继续输入下一条问题，并通过普通发送按钮加入待发送队列。当前运行和必要的工具续传结束后，队列按先后顺序发送，仍属于原来的 Thread。

这是当前页面内的 Composer 能力，不是持久后台任务队列，也不会让同一 Thread 并行执行多个独立 Agent。

## 1. 启用

修改业务页面挂载 `Agent` 的文件，例如 `src/AssistantPage.tsx`：

```tsx
import { Agent } from './agent-ui';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" enableMessageQueue />;
}
```

配置通过 `<Agent />` 传入；外层有 `AgentUIProvider` 时也一样。多助手使用 `<AgentUIApplication ... enableMessageQueue />`，每个助手分别配置。省略时继承项目的 `conversationMessageQueueEnabled`；新建项目默认关闭。传 `enableMessageQueue={false}` 可显式关闭。

需要修改项目默认值时，在现有 `application/project-config.tsx` 的 `createAgentUIProject({ ... })` 参数中增加 `conversationMessageQueueEnabled: true`，保留其他参数和接线。直接使用 `ConversationRuntimeProvider` 的集成方可传同名的 `enableMessageQueue`，默认关闭。

默认 Composer 已包含待发送列表与移除按钮，普通发送按钮在运行中显示“加入发送队列”。这项能力不需要额外安装一个队列插件。自定义输入区时，保留已有 Composer 和发送动作；手写另一个请求函数不会自动获得队列行为。

Vue／HTML 使用定制 Web Component 时，在 React 生产工程中通过包装入口的 `agentProps` 配置，再重新构建资源，见[服务适配位置](./service-integration#vue--html-服务适配位置)。不要向 Web Component 的 config 随意添加 `enableMessageQueue` 字段。

## 2. 用户怎样操作

1. 发送问题 A，让它保持生成中。
2. 在同一个输入框写问题 B，点击普通发送按钮；B 出现在“待发送”列表中，此时没有立即创建第二次 Agent 请求。
3. 继续加入 C。若不再需要 B，点击 B 的移除按钮，当前 A 不受影响。
4. A 正常结束后，剩余消息依次发送；等待上一条结束后再发送下一条。每次发送创建新的运行，Thread 不变。

排队提交保留原生 Composer 中的附件和指令引用身份；附件仍需完成原有准备与上传流程。队列项只有在实际发出后才进入已发送消息，不应把待发送项当作已经处理成功的聊天历史。

## 3. 停止、审批和切换会话

| 情况 | 行为 |
| --- | --- |
| 当前回复正常完成 | 自动发送队首，按顺序继续。 |
| 前端工具仍在执行或等待其续传 | 保留后续消息，先处理当前运行的工具与续传。 |
| Agent 暂停等待审批／补充信息 | 后续消息保留，不用普通排队消息代替审批回答；完成原中断并正常续传后再继续队列。 |
| 用户停止当前运行 | 已排队的消息保留，但停止后的收尾不会立即触发下一条；后续显式发送或新运行可以重新驱动队列。需要舍弃的项应主动移除。 |
| 在同一助手中切换 Thread | 每个 Thread 保留自己的队列；切回后能看到其待发送项。其他 Thread 不会收到这些消息。已挂载后台 Thread 可以继续运行和处理自己的队列。 |
| 编辑已发送消息，或重新生成回复 | 原生编辑／重新生成会清空该 Thread 的待发送队列，操作前检查是否有仍需发送的内容。 |
| 收起保留子树的 Shell，或通过 `hidden` 隐藏助手 | 挂载状态保留，队列与后台运行不因隐藏而停止。 |
| 刷新页面、卸载助手或重建其会话边界 | 不保证保留内存队列；它不随历史接口保存。 |

服务失败时，运行结果与待发送状态分开检查；不要把请求结束当作回答成功，也不要假设报错会替用户清空剩余消息。继续发送前核对界面上的错误与队列，删除不再需要的项。

## 4. 普通发送与工作流发送的区别

| 入口 | 运行中是否加入 Composer 队列 |
| --- | --- |
| 默认 Composer 普通发送按钮／原生提交动作 | 开启队列且当前 Composer 允许发送时可以排队；等待审批等状态仍受现有保护。 |
| 带 `endpoint` 的 `ConversationComposerSend` 工作流按钮 | 不排队，运行中不可用。 |
| `host.sendComposer(options?)` | 不用于运行中排队；仍会检查运行和草稿准备状态，失败需处理 Promise。 |
| `host.sendMessage()` / `thread.sendMessage()` | 不排队，运行中报忙；不会因设置 `enableMessageQueue` 而自动变成队列 API。 |

业务代码发送的错误应按[会话方法](./react-host-api#会话方法)处理。工作流 URL 选择、指定助手和后台 Thread 操作见[多 Agent](./multiple-agents)。不要为模拟排队而轮询状态并重复发送，也不要把多个独立请求合并进一个 Thread。

## 5. 文案与验证

队列提示使用项目已有语言层：`locales.composer.queueSend`、`queued`、`removeQueued`，通过 `Agent locales` 或 `application/locales.ts` 覆盖，见[语言与文案](./localization)；完整字段见[文案字段参考](./locale-reference#输入附件与语音服务)。

使用慢速 Mock 或测试服务检查：A 运行中加入 B/C，仅 A 已发出；移除 B 后，A 正常完成才发 C，且 `threadId` 相同。再分别检查停止、审批后继续、切换 Thread、编辑与重新生成，以及刷新后内存队列不被误认为持久历史。业务页面程序化发送要单独检查报忙处理。
