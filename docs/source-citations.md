# Sources / Citations

Sources 是 assistant-ui presentation；AG-UI 0.0.59 和 1.0 当前都没有标准 citation/source wire event。`document.source` 表示附件数据来自 URL 还是 data，不是回答引用来源。

## 原生 assistant-ui 链路

`SourceMessagePart → ConversationThread → official Sources renderer`。

默认 ConversationThread 支持 `type: "source"` 的 URL 和 document part。Plugin 使用产品 facade `ConversationSourcePart` 和 `<ConversationSource {...source} />`，不依赖 assistant-ui 原始类型或私有路径。facade 直接代理 vendored 官方 Sources，保留 `data-slot="source"`、`source-title` 和 `source-document-icon` 等 DOM contract。

## AG-UI Reference Demo

选择 `source-citations` 场景，安装其声明的 Official Resource `source-citations-message`（Source Registry item `plugin/source-citations-message`）。它是 render-only、standalone 的 named backend Tool UI，不创建 Runtime，也不向后端注册可执行的 Frontend Tool。

- Protocol: AG-UI Tool Call
- Pattern: Application-defined Tool Result → Sources
- Presentation: assistant-ui Sources

```text
search_sources
→ TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END
→ TOOL_CALL_RESULT.content (JSON string)
→ react-ag-ui tool-call.result (object)
→ SearchSourcesToolUI
→ validate → ConversationSource[] → official Sources
→ TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT / TEXT_MESSAGE_END
```

`search_sources` 的 Tool Result 示例：

```json
{
  "sources": [
    {
      "sourceType": "url",
      "id": "react-19",
      "url": "https://react.dev/blog/2024/12/05/react-19",
      "title": "React 19"
    },
    {
      "sourceType": "document",
      "id": "migration-guide",
      "title": "Internal migration guide",
      "mediaType": "application/pdf",
      "filename": "migration-guide.pdf"
    }
  ]
}
```

AG-UI does not define a citation/source event.

The sources schema belongs to search_sources Tool Result.

assistant-ui SourceMessagePart is a frontend/runtime presentation contract.

这个 schema 只属于 `search_sources`，不是全局 AgentUICreator 协议。projector 要求 sources 数组、非空且唯一的 id；URL 只允许有效的 `http://` / `https://`，拒绝 javascript、data 和非法 URL；document 要求非空 title、mediaType，filename 可选。可选字符串存在时必须非空。未知字段不会传给 facade，任一条目无效会整体回退到 ConversationToolFallback。空数组是有效结果，展示零个 Sources。运行中、失败或无有效结果时保留官方 Tool fallback。

没有 CUSTOM sources 标准化、自定义 SOURCE_* event、全局 Tool Result 转 Source、Runtime inference 或 ConversationService 改造。Tool UI 只展示来源，不把结果写入 message source parts，不实现正文位置绑定、脚注、搜索逻辑或新的持久化协议。

Source Registry 内容 freshness 继续由 target set 与 content hash 决定；修改现有内容不 bump item version。
