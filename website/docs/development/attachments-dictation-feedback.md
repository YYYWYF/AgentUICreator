---
title: "附件、语音与评价服务"
---

# 附件、语音与评价服务

通用能力已有默认实现。接入自己的服务时，通过 `Agent` 的 `attachments`、`dictation`、`feedback` 属性传入配置。也可以把接口说明交给 Creator 完成。

## 附件

**默认无需配置**：文件发送时读取为 Base64，随消息交给 Agent，不要求先上传服务器。默认每个文件不超过 20 MiB；后端需支持所选文件类型。

需要上传时，通过 `Agent attachments={...}` 接入上传服务。通用实现使用 `POST multipart/form-data`，默认字段为 `file`，读取响应中的 `url`；字段名和响应路径可以在实现中调整。返回的 HTTP(S) 文件 URL 会进入消息内容，上传接口地址不会进入消息。

## 语音

**默认使用受支持的浏览器语音识别**，需要麦克风权限；识别结果放入草稿，由用户发送。

有自己的转写服务时，Creator 在同一个实现文件中接入。通用实现录音后以 `POST multipart/form-data` 提交，默认音频字段为 `file`，读取响应的 `text`。特殊格式由 Creator 适配。

自定义 `dictationAdapter` 仍将临时和最终识别结果写入同一个 Composer 草稿，不创建独立语音 Runtime。沿用已安装版本的 listen/session 接口约定，保留停止、取消、错误与卸载清理；`dictation={false}` 可关闭内置适配器。接入后检查权限拒绝、服务失败、停止/取消和实际设备行为，不能仅凭类型检查认定转录成功。

## 反馈

**默认只保留当前会话界面的点赞、点踩选择**。需要保存时，由 Creator 在同一个实现文件中接入业务服务。

通用实现发送 `POST application/json`，内容包括 `threadId`、`messageId`、`type`（`positive` 或 `negative`），有说明时携带 `comment`。成功 HTTP 状态即可，支持 `204`。

## 手动配置示例

直接在使用 `Agent` 的位置传入：

```tsx
<Agent
  attachments={{
    uploadUrl: '/api/files',
    fieldName: 'file',
    urlField: 'url',
    credentials: 'include',
  }}
  dictation={{ url: '/api/transcribe', fieldName: 'file', textField: 'text' }}
  feedback={{ url: '/api/feedback' }}
/>
```

以上地址替换为实际业务接口。不需要某项服务时保留其已有配置或省略；同源请求默认携带同源凭据，跨域凭据需要服务端相应支持。

| 配置 | 常用字段 |
| --- | --- |
| `attachments` | `dataSource`、`uploadUrl`、`fieldName`、`urlField`、`accept`、`maxSizeBytes` |
| `dictation` | `dataSource`、`url`、`fieldName`、`textField`、`language` |
| `feedback` | `dataSource`、`url` |
| URL 请求共同支持 | `headers`、`credentials`，仅使用浏览器可持有的用户凭据 |

## 复用已有业务 API / Axios 封装

已有请求模块负责签名、鉴权、加解密或响应解包时，传入对应的 `dataSource`，不需要提供 URL。下面的 `businessApi` 代表项目已有的业务 API；返回字段按实际接口转换。

```tsx
<Agent
  attachments={{
    dataSource: {
      async upload(file, { signal } = {}) {
        const result = await businessApi.uploadFile(file, { signal });
        return result.downloadUrl;
      },
    },
  }}
  dictation={{
    language: 'zh-CN',
    dataSource: {
      async transcribe(audio, { signal, language } = {}) {
        const result = await businessApi.transcribe(audio, { signal, language });
        return result.text;
      },
    },
  }}
  feedback={{
    dataSource: {
      async submit(feedback) {
        await businessApi.saveFeedback(feedback);
      },
    },
  }}
/>
```

`upload` 接收原始 `File` 并返回 HTTP(S) 文件 URL 字符串；相对 URL 按当前页面地址解析。文件类型和大小限制仍生效。`transcribe` 接收包含文件名与 MIME 类型的录音 `File` 并返回文字字符串；录音、麦克风释放和 Composer 草稿仍由内置实现处理。将 `signal` 传给业务请求模块以支持取消，取消后的上传和转写结果不会写回。`submit` 接收 `threadId`、`messageId`、`type` 和可选 `comment`，成功时无需返回数据。

优先级为显式 `attachmentAdapter` / `dictationAdapter` / `feedbackAdapter`、配置中的 `dataSource`、URL 默认实现。`dataSource` 自行负责请求、鉴权和返回结构转换，URL、HTTP headers、credentials 和响应字段路径不会应用到它；业务方法失败时报告错误，不回退发送 URL 请求。省略 `dataSource` 保持原有行为。可从 `@za38.03/agent-ui-runtime` 导入 `AttachmentDataSource`、`DictationDataSource` 和 `FeedbackDataSource` 类型；建议在组件外定义或用 `useMemo` 保持对象稳定，替换对象会更新适配器。

历史会话使用生成项目 `application/Agent.tsx` 的 `conversationDataSource`，提供 `list`、`get`、`delete` 和可选的重命名、归档方法。AG-UI 流式请求通过 `fetch` 接入，见[连接 Agent](/development/connect-agent)；上传、转写与反馈的 `dataSource` 不改变流式请求。

特殊协议可以在项目服务文件中实现 `attachmentAdapter`、`dictationAdapter` 或 `feedbackAdapter`。通过 `ConversationRuntimeProviderProps` 的对应字段获取完整类型，再通过 `Agent` 的同名属性传入；不要修改 Runtime 或把服务端私密 Key 写入前端。

## 交给 Creator 接入

复制下面的话，替换【】中的内容：

```text
请接入或修改【附件上传 / 语音转写 / 评价保存】：
接口：【URL】，鉴权：【沿用当前登录凭据】，请求和响应示例：【粘贴接口说明】。
请在项目实现中修改，保留现有布局和功能。
```

Creator 修改项目自己的业务服务配置或实现，复用通用请求实现；预签名上传、多步认证或特殊格式使用项目内的适配代码。鉴权沿用业务登录服务，服务端私有 Key 留在业务网关。路径相对于生成的 Agent UI 源码目录。
