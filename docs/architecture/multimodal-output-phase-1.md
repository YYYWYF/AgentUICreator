# 多模态工具结果展示

当前依赖为 `@ag-ui/core` / `@ag-ui/client` 1.0.3、`@assistant-ui/react` 0.15.31 和 `@assistant-ui/react-ag-ui` 0.1.0。`tool-result` 使用标准 AG-UI 工具结果内容数组，在既有 `toolFallback` 语义边界展示文本、图片、音频、视频及文档，不修改 upstream 或事件解析器。

## 协议与组合

```text
AG-UI TOOL_CALL_RESULT.content: string | ContentPart[]
  → canonical react-ag-ui converter
  → assistant-ui tool-call result
  → 专用工具 renderer（若已注册）
  → conversation-surface.toolFallback 的 tool-result
  → 共享 Image / File / Media Player 展示
```

工作台、悬浮助手和嵌入式助手默认启用 `tool-result`。`toolFallback` 位置只保留一个插件；使用基础 `tool-fallback` 的工程可以显式替换。专用工具 renderer 继续优先，前端工具、工具时间线和子任务复用相同的结果展示选择，不创建第二个 Runtime。

普通字符串、业务 JSON 或不符合内容数组结构的结果仍显示原始结果。后端工具结果展示不授予前端执行权限，也不把后端工具加入 `RunAgentInput.tools`。

## 内容与文件来源

内容按数组顺序展示，包含 text、image、audio、video、document。`source.type` 为 url 时使用可访问的 HTTP(S)/Blob URL，为 data 时使用携带 MIME 的 Base64；为 file 时 value 是提供方文件 ID，必须通过项目 `resolveFile` 转为媒体地址，不能猜成 URL。解析请求在切换或卸载时取消。

图片复用共享预览；音视频由用户点击播放，不自动播放，暂不提供下载入口；文档提供文件卡片和下载入口，不内嵌执行其内容。`metadata.filename` 是可选展示约定。业务鉴权、浏览器可访问性和实际媒体类型支持由项目服务验证。

公开应用入口使用 `ConversationToolResultPlugin`，支持 `renderPart`、`resolveFile`、直接整体样式与展开状态，以及独立 args/error/approval 等组件参数。专用 renderer 可复用 `ConversationToolResultContent`。保留原有工具、错误、审批、中断和焦点处理，固定文案沿用统一 locale。完整格式见 [工具结果](../../website/docs/plugins/tool-result.mdx)。

## Canonical owner 与源码接管

唯一展示及内容适配位于 `packages/plugins/src/plugins/tool-result/adapters/presentation/`，npm 与 portable snapshot 从同一 owner 构建。交付由 `plugin-delivery.json` 和插件 `plugin.json` 声明。项目先在自己的薄应用层定制 props/组合，无需接管；实现内部修改须按 [源码所有权](npm-default-plugin-source-ownership.md)准备并确认接管计划。

## 生成文件与 Mock

`generated-file-message` 保留工具 `generate_file` 的具名 backend renderer。其 `{ filename, mimeType, url }` 是该工具的业务结果合同，不是通用 AG-UI 文件协议。仅成功、非错误且字段与 HTTP(S) URL 有效时显示文件；其他状态使用现有回退。

Mock 的 `file-output` 场景在 `packages/creator/src/mock-agent/builtins/file-output.ts`，通过标准工具事件返回演示 JSON，不生成真实文件。示例 URL 的存在性或下载成功需要独立文件服务验证，不能由 DOM 或 Mock 回答证明。

## 验证

相关回归包括 Plugins 的 `tests/tool-result.test.tsx`、`tests/migrated/generated-file-message.test.tsx`、`tests/migrated/generated-file-ag-ui-integration.test.tsx`，以及 Creator Mock 的文件输出测试。按修改范围核对实际消息转换、内容顺序、URL/Base64/文件解析、取消、错误与审批、历史回放及工具优先级。

静态/单元、受控 Mock、实际浏览器媒体和业务文件服务分别报告。不要把演示下载链接存在当作文件已生成或真实下载通过；Windows 的路径、构建与浏览器结果单独验证。
