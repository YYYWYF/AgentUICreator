# 附件上传服务

本页说明如何把用户选择的文件上传到自己的文件服务，再将文件 URL 随消息交给 Agent。

## 选择接入方式

| 你的需求                  | 接入方式                                             |
| --------------------- | ------------------------------------------------ |
| 不使用文件服务，直接随消息发送文件内容   | 无需配置，默认使用 Base64，每个文件最多 20 MiB                   |
| 配置上传地址，由内置流程上传        | 传入 `attachments.uploadUrl`，按下面步骤配置               |
| 使用已有上传方法，或处理业务成功码、签名等 | 传入 `attachments.dataSource`，见[自定义上传方法](#自定义上传方法) |

上传配置直接传给业务页面中的 `<Agent attachments={...} />`，如下例所示。

业务系统已经有文件 URL 时，无需再次上传，见[发送已有附件 URL](/development/react-host-api.md#发送已有附件-url)。需要改变附件交互流程时，见本页最后的[进阶定制](#进阶定制)。

## 配置 URL 上传

### 在页面中配置

打开挂载 `<Agent />` 的业务页面，例如 `src/AssistantPage.tsx`，添加 `attachments`：

```tsx
import { Agent } from './agent-ui';

export function AssistantPage() {
  return (
    <Agent
      endpoint="/api/agent"
      attachments={{
        uploadUrl: '/api/files',
        fieldName: 'file',
        urlField: 'data.url',
        accept: 'image/*,.pdf',
        maxSizeBytes: 20 * 1024 * 1024,
      }}
    />
  );
}
```

| 配置项            | 填什么                                             |
| -------------- | ----------------------------------------------- |
| `uploadUrl`    | 你的上传接口地址，例如 `/api/files`                        |
| `fieldName`    | 接口接收文件的表单字段名，默认 `file`                          |
| `urlField`     | 从响应 JSON 的哪个字段取文件 URL，例如 `data.url`；默认 `url`    |
| `accept`       | 允许选择的文件类型；示例允许图片和 PDF，不填则不限类型                   |
| `maxSizeBytes` | 单个文件的最大字节数，默认 20 MiB                            |
| `headers`      | 可选，上传接口的请求头，例如 `{ Authorization: token }`       |
| `credentials`  | 可选，跨域上传需要携带 Cookie 时设置为 `'include'`，服务端也需允许跨域凭据 |

上传鉴权需在这里单独配置，不会继承 `Agent request`；Token 变化后需更新配置。

输入区还需要有附件按钮，例如 `add-attachment-action` 插件。Vue/HTML 项目在 [React 生产工程](/development/service-integration.md#vue--html-服务适配位置)中配置，再重新构建。

### 上传接口的请求与响应

用户选择文件后，**点击发送时才会上传**。上面的配置会向 `/api/files` 发送 POST 请求，使用 `multipart/form-data`，其中 `file` 字段是用户选择的原始文件。不要手动设置 `Content-Type`，浏览器会自动补全。

接口需要返回成功 HTTP 状态和 JSON。上面的 `urlField: 'data.url'` 对应：

```json
{ "data": { "url": "https://files.example.com/uploads/order.pdf" } }
```

**这里的 URL 是上传后文件的访问地址，不是上传接口地址。** 建议返回完整的 HTTP(S) 地址；相对地址会按上传接口地址解析。只有 `204` 或业务成功码、没有文件 URL，不能完成上传。

上传接口只需提供文件 URL，文件名和 MIME 类型由前端从所选文件取得。若还需判断 `code: 0` 等业务成功码，使用[自定义上传方法](#自定义上传方法)。

## 去哪里确认配置和上传成功

打开浏览器开发者工具的 **Network（网络）**，选择一个 PDF 并点击发送：

| 看哪里                       | 应该看到什么                                    |
| ------------------------- | ----------------------------------------- |
| 上传请求 `/api/files`         | 地址正确，表单中有 `file` 字段及所选文件；需要鉴权时，请求带有所配置的凭据 |
| 上传请求的响应                   | HTTP 成功，`data.url` 是文件访问地址                |
| 随后的 Agent 请求 `/api/agent` | 请求体的 `messages` 中，用户消息包含刚返回的文件地址，示例见下方    |
| 实际 Agent 处理结果             | Agent 能读取并处理文件；上传成功本身不代表 Agent 已读到文件      |

PDF 对应的用户消息内容项应类似：

```json
{
  "type": "document",
  "source": {
    "type": "url",
    "value": "https://files.example.com/uploads/order.pdf",
    "mimeType": "application/pdf"
  },
  "metadata": { "filename": "order.pdf" }
}
```

文件选择后出现的缩略图可能只是本地预览，不能据此判断上传成功。以上请求中的地址以你自己的配置为准。

## 回显和下载需要哪些字段

### 当前消息中的附件

使用上面的内置上传流程时，前端会自动组合这些信息，无需上传接口重复返回：

| 信息      | 来源                                            | 用途           |
| ------- | --------------------------------------------- | ------------ |
| 文件 URL  | 上传响应中的 `data.url`                             | 读取、预览或下载文件   |
| 文件名     | 所选文件的 `name`，发送时放入 `metadata.filename`        | 显示名称、提供下载文件名 |
| MIME 类型 | 所选文件的 `type`，例如 `application/pdf`、`image/png` | 区分图片与普通文件    |

默认附件卡片支持图片缩略图和点击放大；普通文件卡片显示文件图标及名称提示，**不自带下载按钮**。需要下载入口时，在项目附件展示组件中使用文件 URL 和文件名添加链接。

### 刷新后的历史回显

刷新后能否看到附件，取决于[历史服务](/development/history-backend.md)是否保存并返回了附件内容，不能只保存消息文字。当前历史接口使用 LangChain 消息格式，字段与上面的 AG-UI 请求不同：

| 文件类型    | 历史消息 `content` 中的字段                                                                        |
| ------- | ------------------------------------------------------------------------------------------ |
| 图片      | `type: "image_url"`，`image_url.url` 为图片地址                                                  |
| PDF 等文件 | `type: "file"`，`source_type: "url"`，`url` 为文件地址，`mime_type` 为文件类型，`metadata.filename` 为文件名 |

例如，历史详情中的一条 PDF 用户消息：

```json
{
  "id": "user-1",
  "type": "human",
  "content": [{
    "type": "file",
    "source_type": "url",
    "url": "https://files.example.com/uploads/order.pdf",
    "mime_type": "application/pdf",
    "metadata": { "filename": "order.pdf" }
  }]
}
```

图片可使用 `{ "type": "image_url", "image_url": { "url": "https://files.example.com/uploads/photo.png" } }` 作为内容项。配置后刷新页面，重新打开会话，确认图片可预览、文件名称正确，下载入口可打开文件。

### 文件地址要能被实际访问

浏览器和 Agent 都需要有权限读取文件；上传请求的 Token 不会自动用于预览或下载。需要鉴权时，应提供相应读取方可访问的地址或签名 URL。历史中的签名 URL 过期后也需要由业务服务更新。点击文件链接可能打开预览页；需要直接下载时，由文件服务设置 `Content-Disposition: attachment`。

## 自定义上传方法

已有业务上传方法，或接口还需要判断业务成功码时，使用 `dataSource.upload()`。在同一业务页面中定义下面的 `attachments`，再通过 `<Agent attachments={attachments} />` 传入。例如接口以 `code: 0` 表示成功，文件地址在 `result.downloadUrl`：

```ts
import type { AttachmentConfig, AttachmentDataSource } from '@za38.03/agent-ui-runtime';

const attachmentDataSource: AttachmentDataSource = {
  async upload(file, { signal } = {}) {
    const body = new FormData();
    body.append('document', file, file.name);
    const response = await fetch('/business/documents/upload', {
      method: 'POST', body, signal, credentials: 'include',
    });
    if (!response.ok) throw new Error('FILE_UPLOAD_FAILED');
    const value: { code: number; result?: { downloadUrl: string } } = await response.json();
    if (value.code !== 0 || !value.result?.downloadUrl) throw new Error('FILE_UPLOAD_FAILED');
    return value.result.downloadUrl;
  },
};

export const attachments = {
  accept: 'image/*,.pdf',
  maxSizeBytes: 20 * 1024 * 1024,
  dataSource: attachmentDataSource,
} satisfies AttachmentConfig;
```

示例按业务返回码读取文件地址，也可以直接调用项目已有的上传方法，无需引入额外校验库。`upload()` 接收原始 `File`，成功时返回文件 URL **字符串**，失败时抛错；建议返回完整 URL。

使用 `dataSource` 后，请在函数内处理鉴权、业务返回码和字段转换，并传递 `signal` 以支持取消。`uploadUrl` 等 HTTP 配置不再生效，外层的 `accept` 和 `maxSizeBytes` 仍然生效。

## 进阶定制

`attachmentAdapter` 用于接管完整附件流程：`add()` 处理文件选择，`send()` 处理发送，`remove()` 处理移除。例如需要选完文件立即上传、移除时清理资源，才考虑使用它；普通 URL 上传、自定义请求或多步上传用前面的配置即可。

从 Runtime 获取类型，在项目中实现后传给 `<Agent attachmentAdapter={adapter} />`：

```ts
import type { ConversationRuntimeProviderProps } from '@za38.03/agent-ui-runtime';
type ProjectAttachmentAdapter = NonNullable<ConversationRuntimeProviderProps['attachmentAdapter']>;
```

提供它后，会优先使用该适配器，文件校验、上传和取消处理需自行实现。仅使用 `attachments` 时，`dataSource` 优先于 `uploadUrl`；两者都不提供则使用默认 Base64。
