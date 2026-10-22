---
title: 连接 AG-UI 服务
---

# 连接 AG-UI 服务

生成的 Agent 前端通过一个 AG-UI 接口与业务 Agent 通信。完成页面挂载后，在业务接入入口配置服务地址，再验证消息与运行状态。

## 配置应用地址

React 工程在生成的 `Agent` 上传入业务 endpoint：

```tsx
<Agent endpoint="/api/agent" locale="zh-CN" />
```

如果页面使用 `AgentUIProvider` 管理会话，将 endpoint 传给外层 Provider，内部使用 `<Agent />`。具体配置见[Agent 参数与配置](./agent-options)。Vue/HTML 则在 [Web Component](./web-component) 的 attribute 或 config 中配置地址。

`/api/agent` 应指向业务 AG-UI 服务或网关。接口需返回当前客户端可消费的 AG-UI 事件流；模型服务的 Chat Completions JSON 不能直接作为这个接口。

## 验证实际响应

1. 确认地址指向本次要接入的业务服务，停止当前助理运行后再切换。
2. 新建会话并发送测试消息，检查实际请求地址、HTTP 状态与流式响应。
3. 检查首段输出、后续更新和最终运行状态；有工具或审批流程时，使用对应业务场景验证。
4. 检查错误、取消和网络中断的表现。收到部分文字或显示 ready，都不足以说明一次运行已经完成。

认证与跨域条件见[认证与网络](./authentication-and-network)。历史记录单独按[会话服务](./history-backend)接入。

## Creator 开发预览

需要在 Creator 预览中连接同一个服务时，打开设置的「连接 Agent」，选择来源并填写 AG-UI 地址，保存后核对连接方式。

| 方式 | 网络路径 | 使用条件 |
| --- | --- | --- |
| 直连 | 浏览器直接访问 Agent。 | CORS、认证和浏览器网络可达。 |
| 开发转发 | 经 Creator 开发服务访问。 | 工具运行，工程身份和目标地址正确。 |

这里的设置用于开发预览。正式应用使用前面配置的业务 endpoint 与业务网关；Creator 的模型地址则在[模型配置](../guide/model-configuration)中单独管理。尚无业务后端时，可先使用[模拟联调](../guide/mock/)验证界面。

请求失败时，按[Agent 排障](../troubleshooting/agent-and-history)记录状态码、响应类型和最后收到的事件。
