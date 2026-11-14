# 业务服务接入总览

这一组文档用于**手动接入自己的服务**。每篇分别给出修改文件、请求与响应格式、格式不一致时的适配代码，以及页面接线和验证方法。

先完成 [React](/development/react.md)、[Vue](/development/vue.md) 或 [HTML](/development/web-component.md) 挂载，再按业务需要接入下表中的服务。各项独立配置，不要求一次实现全部接口。

## 服务与修改位置

本组文档假设 Agent UI 源码目录是 `src/agent-ui/`。表中相对路径均在该目录下；初始化选择了其他目录时，替换此前缀。`src/AssistantPage.tsx` 是下面约定的**业务页面文件名**，可以换成项目实际挂载 `<Agent />` 的文件。

| 要接入的能力                                                   | 修改入口                                                                                                | 接入方式与协议                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [Agent 对话与工作流](/development/connect-agent.md)            | `src/AssistantPage.tsx` 的 `Agent endpoint/request/fetch`；工作流按钮在项目插件应用层                              | POST AG-UI 请求，返回事件流；自定义 `fetch` 适配传输            |
| [历史会话](/development/history-backend.md)                  | `services/conversations/http-data-source.ts`                                                        | 默认 HTTP 路由、响应解码；也可注入完整 `ConversationDataSource` |
| [附件上传](/development/attachment-upload.md)                | 页面 `Agent attachments`；可新建 `services/attachments.ts`                                                | multipart 上传，返回文件 URL；或 `dataSource.upload()`   |
| [语音转写服务（开发中）](/development/speech-to-text.md)            | 开发中                                                                                                 | 暂不提供业务转写服务接入教程                                  |
| [回复评价](/development/feedback-service.md)                 | 页面 `Agent feedback`；可新建 `services/feedback.ts`                                                      | JSON 提交评价；或 `dataSource.submit()`               |
| [一号通登录（开发中）](/development/auth-service.md)               | 业务页面 `Agent request.headers/user`                                                                   | 当前由外部系统自行登录，再传入凭据和展示资料                          |
| [搜索候选与命令](/development/composer-sources.md)              | `plugins/mention-trigger/index.tsx`、`plugins/conversation-command-source/definition.ts`，以及项目自己的来源实现 | `@` 使用异步搜索来源；`/` 使用命令来源／注册器                     |
| [前端工具与页面操作](/development/frontend-tools.md)              | 业务页面 `Agent frontendTools`，工具实现可放 `services/frontend-tools.ts`                                      | 声明参数 Schema，在 `execute()` 中调用现有业务方法或接口          |
| [业务上下文与通知](/development/business-context.md)             | 页面 `Agent getRunContext/appEventSchemas` 与 Provider 内的订阅组件                                          | 每次运行携带 `context`；接收 `CUSTOM` 业务通知               |
| [自定义 AG-UI 事件与消息渲染](/development/custom-ag-ui-events.md) | 项目消息插件的 `schema.ts`、`index.tsx`、`definition.ts` 与页面事件配置                                             | 约定业务事件数据，校验并注册新的消息卡片                            |

上表建议新建的 `services/*.ts` 是项目自己的代码组织方式，不是工具自动生成的固定文件。已有请求模块时直接复用它。新建服务文件后仍需按各篇示例导入并接线，只有文件不会自动生效。

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

| 业务接口与默认协议的差异            | 应该改哪里                                  |
| ----------------------- | -------------------------------------- |
| 仅 URL、用户凭据不同            | 修改对应服务的 URL、headers、credentials        |
| 上传的返回数据多包了一层            | 使用 `urlField: 'data.url'` 等字段路径        |
| 历史列表或详情的字段不同            | 在历史配置中提供 `decodeList` / `decodeDetail` |
| 已有 Axios、签名、业务错误码或不同请求体 | 编写项目 `dataSource`；AG-UI 使用专用 `fetch`   |
| 文件选择交互本身需要更换            | 提供 `attachmentAdapter`，类型与入口见附件教程      |

这些适配代码属于项目应用层，通常无需接管官方 Plugin 源码。布局仍放在 `app-ui.json`；URL、函数、鉴权和 React props 放在代码中。项目使用自己的请求库和 UI 栈，生产运行无需 Creator。

## 服务鉴权配置

`Agent request` 只配置 AG-UI 请求。历史、上传、转写、评价以及自己编写的数据源各自使用其配置或现有业务请求模块。不会从 AG-UI 配置自动继承 Token。

- URL 配置中的 headers 使用浏览器当前可持有的用户凭据；模型或服务端私有密钥放在业务网关。
- AG-UI、上传、转写、评价的 headers 为普通对象，凭据变化后更新配置。历史 headers 另外支持每次请求读取凭据的函数。
- 使用自定义数据源时，请在数据源内部处理鉴权、业务返回码和字段转换。URL 配置的 headers 不会自动应用到这些方法。
- 跨域 Cookie 需要 `credentials: 'include'` 及服务端配套的 CORS 配置。multipart 的 `Content-Type` 由浏览器添加 boundary。

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
