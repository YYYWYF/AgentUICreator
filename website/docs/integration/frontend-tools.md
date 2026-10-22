---
title: 接入前端工具与自定义工具 UI
---

# 接入前端工具与自定义工具 UI

执行与展示分别定义。应用 allowlist 决定向 Agent 暴露哪些能力；Plugin service 提供实际宿主能力；tool UI 只展示参数、状态和结果。

## 定义执行能力

公开 `AgentFrontendToolSource` 提供 `listTools`、`getRevision`、`subscribe` 和 `execute(call, { signal })`。应用负责 schema 校验、允许列表、服务是否可用和错误转换。

由已有 Runtime 的 `frontendTools` 接口接入，canonical assistant-ui 管调用身份、执行一次、结果注入、取消与继续。不要再监听 AG-UI 帧实现第二个执行器，也不发送伪造用户消息作为工具结果。

## 展示注册

`ConversationFrontendToolUIRegistry` 只包含 `render` 和可选 display。注册 UI 不授权执行，渲染器不能通过 mount 打开弹窗、提交表单或改文件。

有副作用的动作放在 execute 内，保留 `toolCallId` 和 AbortSignal。调用前再次检查服务可用；已取消的调用不执行动作。取消不能撤销已经完成的业务效果。

## 历史与作用域

历史加载、线程切换、StrictMode、重新挂载不能重复执行工具。结果应独立描述当时的事实，例如弹窗曾打开，而不是把当前是否仍打开当作历史执行结果。

目前执行合同只支持 root-thread。嵌套子代理卡片属于展示，不把子代理调用提升为根调用。人类问答、审批与后端工具有自己的执行与恢复语义。

## 验证

覆盖工具可用性变化、重复名字、非法参数、取消前后、执行错误、结果继续、历史回放和卸载。使用[前端工具 Mock](../guide/mock/builtin-scenarios)时也要核对一次发送只执行一次。

> 截图待补：执行弹窗/表单的即时效果与历史回执，证明重新加载历史不会重新执行。

精确类型见[Runtime API](./runtime-api)。
