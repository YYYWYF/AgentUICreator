# 业务服务接入总览

这一组文档说明各项服务改哪里、需要什么数据，以及怎样验证。

先完成 [React](/development/react.md)、[Vue](/development/vue.md) 或 [HTML](/development/web-component.md) 挂载，再按业务需要接入下表中的服务。各项独立配置，不要求一次实现全部接口。

## 服务与修改位置

本组文档假设 Agent UI 源码目录是 `src/agent-ui/`。表中相对路径均在该目录下；初始化选择了其他目录时，替换此前缀。`src/AssistantPage.tsx` 是下面约定的**业务页面文件名**，可以换成项目实际挂载 `<Agent />` 的文件。

| 要接入的能力                                                   | 修改入口                                                                                                | 接入方式与协议                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [Agent 对话与工作流](/development/connect-agent.md)            | 页面 `Agent endpoint/request/beforeRequest/fetch`；工作流按钮在项目插件入口                                        | POST AG-UI 请求，返回事件流；`beforeRequest` 准备参数，`fetch` 适配传输    |
| [历史会话](/development/history-backend.md)                  | `services/conversations/data-source.ts`                                                             | 直接编辑 `list/get/delete/...` 方法中的请求和响应转换；也可传入完整数据源         |
| [附件上传](/development/attachment-upload.md)                | 页面 `Agent attachments`；可新建 `services/attachments.ts`                                                | multipart 上传，返回文件 URL；或 `dataSource.upload()`            |
| [语音转写服务（开发中）](/development/speech-to-text.md)            | 开发中                                                                                                 | 暂不提供业务转写服务接入教程                                           |
| [回复评价](/development/feedback-service.md)                 | 页面 `Agent feedback`；可新建 `services/feedback.ts`                                                      | JSON 提交评价；或 `dataSource.submit()`                        |
| [一号通登录（开发中）](/development/auth-service.md)               | 业务页面 `Agent request.headers/user`                                                                   | 当前由外部系统自行登录，再传入凭据和展示资料                                   |
| [搜索候选与命令](/development/composer-sources.md)              | `plugins/mention-trigger/index.tsx`、`plugins/conversation-command-source/definition.ts`，以及项目自己的来源实现 | `@` 使用异步搜索来源；`/` 使用命令来源／注册器                              |
| [前端工具与页面操作](/development/frontend-tools.md)              | 业务页面的 `Agent toolkit`                                                                               | 注册 `human + render` 收集用户输入，或 `frontend + execute` 调用业务方法 |
| [给 Agent 传递业务参数](/development/business-context.md)       | 页面 `Agent ctx/getRunContext` 与 `sendMessage` 参数                                                     | 发送消息时附带业务参数                                              |
| [自定义 AG-UI 事件与消息渲染](/development/custom-ag-ui-events.md) | 项目消息插件的 `data.ts`、`index.tsx` 与 `definition.ts`                                                     | 定义业务事件数据类型，注册并渲染新的消息卡片                                   |

历史数据源文件由初始化生成；附件、评价等教程中的文件按需新建。已有请求模块可以直接复用，再按示例接到 `Agent` 或对应插件中。

## 同时接入多项服务

各篇教程导出的配置可以在同一个业务挂载文件中组合。例如，完成附件和评价教程后，在 `src/AssistantPage.tsx` 中传入两项配置：

```tsx
import { Agent } from './agent-ui';
import { attachments } from './agent-ui/services/attachments';
import { feedback } from './agent-ui/services/feedback';

export function AssistantPage() {
  return <Agent endpoint="/api/agent"
    attachments={attachments} feedback={feedback}
    onError={error => console.error('AGENT_UI_SERVICE_ERROR', error)} />;
}
```

保留已有页面的其他 props 和 Provider。业务错误处理可在回调内接入现有日志与本地化提示。

## 适配方式选择

| 业务接口与默认协议的差异     | 应该改哪里                                       |
| ---------------- | ------------------------------------------- |
| 仅 URL、用户凭据不同     | 修改对应服务的 URL、headers、credentials             |
| 历史接口的地址、方法或请求体不同 | 修改 `data-source.ts` 对应方法中的请求                |
| 上传的返回数据多包了一层     | 使用 `urlField: 'data.url'` 等字段路径             |
| 历史响应字段或业务返回码不同   | 在 `list()`、`get()` 等方法中检查并转换返回值             |
| 已有 Axios、签名或特殊传输 | 复用项目请求模块或编写 `dataSource`；AG-UI 使用专用 `fetch` |
| 文件选择交互本身需要更换     | 提供 `attachmentAdapter`，类型与入口见附件教程           |

接口接入直接修改项目代码，通常无需接管插件源码。布局放在 `app-ui.json`，请求与鉴权放在代码中。

## 当前能力与边界

接入时按业务需要选择：

| 能力           | 当前支持                                                                              | 需要另行处理的需求                                                                                                  |
| ------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AG-UI 对话与工作流 | 自定义 `fetch`、用户凭据、流式响应、工具续传和审批恢复                                                   | 自有协议需转换为 AG-UI；请求封装需保留流和取消信号                                                                               |
| 历史会话         | 在项目数据源中实现列表、详情、删除、重命名和归档                                                          | `list()` 一次返回完整数组；分页、服务端搜索和消息保存由业务实现                                                                       |
| 附件           | 默认 Base64、HTTP 上传或自定义数据源；支持取消和类型／大小限制                                             | 分片、断点续传、上传进度及文件读取权限需业务适配；通用上传接口只返回最终 URL                                                                   |
| 评价           | 提交赞／踩和可选说明，自定义鉴权与业务返回码                                                            | 没有评价回读、撤回或取消请求接口；保存失败不自动恢复按钮选择                                                                             |
| 搜索候选与命令      | 异步提及搜索；远程命令加载后注册，本地 action 可调用业务接口                                                | 账号／权限变化需更新来源或缓存标识；服务端 JSON 中的命令需由项目代码绑定允许的动作                                                               |
| 业务参数         | `ctx` 传 JSON 参数，`getRunContext` 同步读取页面文本上下文                                       | 异步数据需先加载；上下文读取失败仍继续请求，不能用作必须成功的权限校验                                                                        |
| 程序化媒体发送      | `sendMessage()` 支持文本和 image/audio/video/document 附件 URL，原生草稿用 `sendComposer()` 提交 | 只接受 HTTP(S) URL 来源；音频／视频需 MIME 类型，远程文件类型／大小与读取权限由业务服务校验，见[发送示例](/development/react-host-api.md#发送已有附件-url) |
| 语音与登录        | 浏览器听写、外部登录凭据和用户资料接入                                                               | 业务转写与一号通接入仍标为开发中                                                                                           |

Token 刷新、超时和重试沿用项目已有的请求模块。涉及业务写入时，注意避免重复提交。

## 服务鉴权配置

`Agent request` 只配置 AG-UI 请求。历史、上传和评价需要各自配置鉴权。

- AG-UI、上传和评价的 `headers` 为普通对象，凭据变化后更新配置。默认历史数据源在 `conversationConnection.headers()` 中读取凭据。
- 自定义请求或数据源在自己的方法中处理鉴权；需要刷新 Token、获取上传签名时，先完成这些步骤再发送。
- 跨域 Cookie 使用 `credentials: 'include'`，并由服务端允许对应来源。上传表单的 `Content-Type` 由浏览器设置。
- 浏览器只使用用户凭据，模型密钥等服务端密钥放在业务网关。

## Vue / HTML 服务适配位置

`endpoint`、语言和主题可以由 Web Component 的宿主配置。复杂服务适配器是函数，写在**生成该 Web Component 的 React 工程**中，再重新构建和发布资源。

使用生成的 `web-component-bridge` 时，编辑 React 工程的 `application/AgentUICompatibilityRoot.tsx`，通过包装组件的 `agentProps` 传入配置。例如接入附件数据源：

```tsx
import { AgentUICompatibilityRoot as CompatibilityRoot } from '@za38.03/agent-ui-runtime/ui';
import type { ComponentProps } from 'react';
import { ProjectProvider } from './project-config';
import { attachments } from '../services/attachments';

export function AgentUICompatibilityRoot(props: ComponentProps<typeof CompatibilityRoot>) {
  return <ProjectProvider>
    <CompatibilityRoot {...props} agentProps={{ ...props.agentProps, attachments }} />
  </ProjectProvider>;
}
```

历史配置文件也在这个 React 工程中。直接使用官方默认 Web Component 的页面，不能通过添加任意 HTML attribute 注入这些函数；需要定制时使用自己的 [React 工程产物](/development/vue.md#定制-react-产物接入)。

## 接入验证

运行业务项目已有的 `typecheck`、`test`、`build`，并在普通业务页面查看浏览器 Network：核对实际 URL、请求体、返回字段和用户凭据。Creator 的临时连接可能替换 AG-UI 和历史地址，验证生产配置前关闭临时连接。

每项至少检查成功、空结果、接口失败、凭据过期，以及适用的取消操作。各篇末尾列出具体预期；类型检查不代表真实业务接口已经接通。
