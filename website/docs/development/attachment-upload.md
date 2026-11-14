---
title: "附件上传服务"
---

# 附件上传服务

默认在发送时将文件读为 Base64 随消息交给 Agent，每个文件默认最多 20 MiB。需要先上传到业务文件服务、再发送文件 URL 时，按本页配置。后端 Agent 仍需支持读取对应文件类型和 URL。

## 1. 修改入口

新建 `src/agent-ui/services/attachments.ts`：

```ts
import type { ConversationRuntimeProviderProps } from '@za38.03/agent-ui-runtime';

export const attachments = {
  uploadUrl: '/api/files',
  fieldName: 'file',
  urlField: 'data.url',
  accept: 'image/*,.pdf',
  maxSizeBytes: 20 * 1024 * 1024,
  credentials: 'include',
} satisfies Exclude<ConversationRuntimeProviderProps['attachments'], false | undefined>;
```

在挂载 Agent 的业务页面 `src/AssistantPage.tsx` 导入配置：

```tsx
import { Agent } from './agent-ui';
import { attachments } from './agent-ui/services/attachments';

export function AssistantPage() {
  return <Agent endpoint="/api/agent" attachments={attachments} />;
}
```

保留输入区的附件入口，例如 `add-attachment-action`。配置服务不会自动新增按钮。Vue/HTML 在 [React 生产工程](./service-integration#vue--html-服务适配位置)完成接线并重建。

## 2. 默认 HTTP 请求与响应

选择文件后，在**发送消息时**上传。请求为 `POST /api/files`：

```text
Content-Type: multipart/form-data; boundary=浏览器生成

file: <用户选择的原始文件，含文件名与 MIME 类型>
```

`fieldName` 修改 `file` 字段名。浏览器自动生成 boundary，不要手工设置 multipart Content-Type。鉴权可在配置中传 `headers: { Authorization: ... }`，凭据变化后更新配置。

上面的 `urlField: 'data.url'` 对应成功 JSON：

```json
{ "data": { "url": "https://files.example.com/uploads/order.pdf" } }
```

省略 `urlField` 默认读取 `{ "url": "https://..." }`。字段路径支持点分层级，不提供业务成功码判断。

| 内容 | 约定 |
| --- | --- |
| 成功响应 | 成功 HTTP 状态且包含有效 URL 的 JSON；只有 `204` 不够 |
| 文件地址 | HTTP(S)，或可解析成 HTTP(S) 的相对地址；此方式下相对地址按上传接口 URL 解析 |
| 发给 Agent 的内容 | 文件 URL 和文件元信息，上传接口本身的 URL 不作为文件内容 |
| 文件可访问性 | Agent 服务和用户实际读取时需有权限；不会自动转发上传凭据 |

HTTP 失败、无效 JSON、空 URL 或非 HTTP(S) URL 都会失败。业务成功码需要下一节的数据源判断。

## 3. 请求与响应适配

保留页面接线，改写 `services/attachments.ts`。下面业务接口要求字段名为 `document`，以 `code: 0` 表示成功，并返回 `result.downloadUrl`：

```ts
import { z } from 'zod';
import type { AttachmentDataSource, ConversationRuntimeProviderProps } from '@za38.03/agent-ui-runtime';

const responseSchema = z.object({
  code: z.literal(0),
  result: z.object({ downloadUrl: z.string().min(1) }),
});

const attachmentDataSource: AttachmentDataSource = {
  async upload(file, { signal } = {}) {
    const body = new FormData();
    body.append('document', file, file.name);
    const response = await fetch('/business/documents/upload', {
      method: 'POST', body, signal, credentials: 'include',
    });
    if (!response.ok) throw new Error('FILE_UPLOAD_FAILED');
    return responseSchema.parse(await response.json()).result.downloadUrl;
  },
};

export const attachments = {
  accept: 'image/*,.pdf',
  maxSizeBytes: 20 * 1024 * 1024,
  dataSource: attachmentDataSource,
} satisfies Exclude<ConversationRuntimeProviderProps['attachments'], false | undefined>;
```

使用项目已有 `zod`。已有 Axios／签名模块时，在函数内部调用现有业务方法，并传下 `signal`。输入是原始 `File`，输出必须是文件 URL **字符串**，不能返回整个响应对象。数据源返回的相对 URL 按当前页面解析，建议返回完整 URL。

数据源自行负责鉴权、业务失败和字段转换；`uploadUrl`、`fieldName`、`urlField`、headers、credentials 不会应用到它。外层的类型／大小限制仍然生效。失败抛错，不返回空 URL。

## 4. 附件交互定制

预签名上传等多步请求仍可写在 `upload()` 内。只有需要改变添加、移除、发送等生命周期时，才提供完整 `attachmentAdapter`：

```ts
import type { ConversationRuntimeProviderProps } from '@za38.03/agent-ui-runtime';
type ProjectAttachmentAdapter = NonNullable<ConversationRuntimeProviderProps['attachmentAdapter']>;
```

在项目服务文件实现该类型，再传 `<Agent attachmentAdapter={adapter} />`。优先级为显式 `attachmentAdapter` → `attachments.dataSource` → `attachments.uploadUrl` → 默认 Base64；提供完整适配器时需要自行实现相应生命周期。`attachments={false}` 关闭内置适配器；隐藏按钮另在布局中处理。

## 5. 验证

- 发送时出现上传请求，随后 AG-UI 消息使用返回的文件地址。
- 超大文件、类型不符、HTTP 失败和业务失败均不作为成功附件发送。
- 取消上传时实际请求收到 signal，不把迟到结果写回。
- 图片与 PDF 分别测试，刷新后也能展示或打开；确认真实 Agent 能读取 URL。
