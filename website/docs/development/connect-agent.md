---
title: "连接 AG-UI 服务"
---

# 连接 AG-UI 服务

生成的 Agent 前端通过一个 AG-UI 接口与业务 Agent 通信。完成页面挂载后，在页面的 Agent 配置中填写服务地址，再验证消息与运行状态。

具体插件需要的事件名、数据字段和完整 SSE 格式，见[插件显示条件与 AG-UI 数据](/plugins/ag-ui-data)。仅启用插件或返回普通文本，不能自动显示图表、计划或工具卡片。

## 配置应用地址

React 工程在生成的 `Agent` 上传入业务 endpoint：

```tsx
<Agent endpoint="/api/agent" locale="zh-CN" />
```

需要业务联动时，从 `@za38.03/agent-ui-runtime` 导入 `AgentUIProvider` 包住业务组件和 Agent，endpoint 仍传给 `<Agent />`。具体配置见[Agent 参数与配置](/development/agent-options)。Vue/HTML 则在 [Web Component](/development/web-component) 的 attribute 或 config 中配置地址。

`/api/agent` 应指向业务 AG-UI 服务或网关。**接口需返回当前客户端支持的 AG-UI 事件流**；**模型服务的 Chat Completions JSON 不能直接作为这个接口**。

## 请求头与鉴权

在业务页面通过 `Agent` 的 `request` 属性传入 AG-UI 请求的 headers 和 Cookie 策略。例如，`token` 和 `tenantId` 由业务页面当前的登录状态提供：

```tsx
<Agent
  endpoint="/api/agent"
  request={{
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Id': tenantId,
    },
    credentials: 'include',
  }}
/>
```

- `request.headers` 是 `Record<string, string>`，用于传入自定义请求头，不接受回调。登录凭据变化后，由页面更新 props；后续请求使用更新后的配置。
- `request.credentials` 支持 `omit`、`same-origin`、`include`。不传时沿用浏览器 Fetch 的默认行为；需要跨域携带 Cookie 时使用 `include`，服务端同时需要允许对应来源、请求头和凭据。
- 这里只传浏览器可持有的用户凭据；模型 API Key 等服务端密钥由业务网关保管。`Agent user` 只用于用户资料展示，不会自动生成鉴权头。

`AgentApplication` 和 `AgentUIApplication` 也支持相同的 `request` 属性。此配置用于 AG-UI 请求；历史、上传、转写和评价接口的鉴权需在各自的服务配置中设置，见[会话服务](/development/history-backend#地址与鉴权配置)和[附件、语音与评价服务](/development/attachments-dictation-feedback)。

**Creator 开发预览当前会覆盖应用传入的 `endpoint` 并清除 `request` 配置**，因此预览请求不会携带这里配置的自定义 headers 或 Cookie 策略。「连接 Agent」面板目前只配置地址和连接方式；验证应用的鉴权配置时，请关闭临时连接并在普通业务页面测试。

## 验证实际响应

1. 确认地址指向本次要接入的业务服务，停止当前助理运行后再切换。
2. 新建会话并发送测试消息，检查实际请求地址、HTTP 状态与流式响应。
3. 检查首段输出、后续更新和最终运行状态；有工具或审批流程时，使用对应业务场景验证。
4. 检查错误、取消和网络中断的表现。收到部分文字或显示 ready，都不足以说明一次运行已经完成。

历史记录单独按[会话服务](/development/history-backend)接入。

## 临时连接测试

在 Creator 的「设置 → 连接 Agent」中填写 AG-UI 地址，可临时连接 Agent 服务进行测试。**此设置仅在开发态生效，生产环境以应用代码中的 `endpoint` 配置为准。**

可以填写完整 HTTP(S) 地址，也可以填写相对路径。相对路径按**业务页面地址**解析，保存后显示并使用完整 URL。例如业务页面为 `http://localhost:5173/orders/` 时，`/api/agent` 对应 `http://localhost:5173/api/agent`，`./agent` 对应 `http://localhost:5173/orders/agent`；不会拼接 Creator 服务地址。无法取得业务页面地址时，请先打开业务页面，或填写完整地址。

「直接连接」由业务页面的浏览器请求该地址，跨域时需要 Agent 服务允许访问；「转发」由 Creator 开发服务请求解析后的同一地址，再将响应传回页面。业务工程已有开发代理时，相对路径可以继续使用它。

测试结束后，点击「关闭临时连接」，即可恢复使用应用代码中的 `endpoint`。已保存的地址会保留；有正在运行的对话时，需先停止运行。

![Creator 的「连接 Agent」设置：填写服务地址，选择连接方式并使用此地址。](/images/development/agent-connection.png)
