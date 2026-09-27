# 多模态输出 Phase 1：Tool Result File Demo

## 当前协议路径

当前 pinned stack：`@ag-ui/core` / `@ag-ui/client` **0.0.59**、
`@assistant-ui/react` **0.15.22**、`@assistant-ui/react-ag-ui` **0.0.62**。

```text
Mock generate_file backend Tool
→ TOOL_CALL_START / ARGS / END
→ TOOL_CALL_RESULT.content（JSON string）
→ 官方 react-ag-ui converter
→ assistant-ui tool-call.result（object）
→ Plugin Toolkit 的 generate_file named backend renderer
→ ConversationFile facade
→ assistant-ui 官方 File Element / Download
```

结果 `{ filename, mimeType, url }` 的 schema 仅属于 `generate_file` Tool。
项目不新增协议解析器，不修改 AG-UI schema、HttpAgent 或 react-ag-ui converter。
Mock 复用已有 `type: "tool"` step 和 `serializeToolValue`，不新增文件 step/event。

## Presentation ownership

Source Registry item：`plugin/generated-file-message`（初始版本 `0.1.0`）。
它拥有 `GenerateFileToolUI` 和纯函数 `projectGeneratedFileResult(unknown)`。
通过现有 `UIPluginDefinition.toolkit` 注册 `type: "backend"`、
`display: "standalone"`、`render: GenerateFileToolUI`。

Mock 面板将其列为 `file-output` 的文件输出展示资源，沿用现有 Plugin 引入路径：
安装 Source、生成 Plugin Registry，再通过 AppUIModel `applicationPlugins` 启用。
缺失资源时显示静态示意图。Plugin 的 renderer 可用性不授予 Frontend Tool 权限，
也不将 `generate_file` 加入 `RunAgentInput.tools`。

仅当 `status.type === "complete"`、`isError !== true`，且三个字段均为非空
string、URL 是合法 HTTP/HTTPS 地址时显示 File。Running、incomplete、
requires-action、error 和 malformed result 都继续使用 `ConversationToolFallback`。
其他 Tool 的展示路径不变。

`ConversationFileProps` 是 `@agent-ui/react` 的公共 contract：
`filename?`、`data`、`mimeType`、`sourceType?: "url" | "id"`。
facade 只补齐内部 File part 的固定类型和完成状态；不泄露 vendor import path 或
assistant-ui component type，不复制 File 实现或下载逻辑。File 的图标、布局和
Download 可访问名称沿用官方 Element，Plugin 不新增 presentation copy。

## Demo 行为

场景：**Tool Result：File Output**（`file-output`，Presentation）。
输入：`帮我生成一份 PDF 报告`。

Backend result：

```json
{
  "filename": "quarterly-report.pdf",
  "mimeType": "application/pdf",
  "url": "https://example.com/generated/quarterly-report.pdf"
}
```

文件展示使用 PDF/FileText icon、文件名和官方 Download anchor：
`href` 为上述 URL，`download="quarterly-report.pdf"`，
`target="_blank"`、`rel="noopener noreferrer"`。
最终普通 Assistant 文本为 `报告已经生成。`。

没有真实文件生成、文件服务、主动 fetch、Blob 或 createObjectURL。
虚拟 URL 是否存在、打开后是否 404 均不影响 Demo 的 DOM contract。
文件不经过 CUSTOM、STATE、A2UI、DataMessagePart 或 Assistant metadata。

## 测试代码

- `packages/mock-agent/tests/file-output.test.ts`：真实 scenario lifecycle、string
  result、JSON 内容及无 CUSTOM。
- `packages/react/tests/migrated/generated-file-ag-ui-integration.test.tsx`：
  真实 Mock SSE 经过 HttpAgent 和当前 ConversationRuntimeProvider 所用的
  react-ag-ui，检查对象 result、named Tool UI、下载入口和 backend renderer
  不进入 `RunAgentInput.tools`。不 mock converter，也不直接调用 parseJSONText。
- `packages/react/tests/migrated/generated-file-message.test.tsx`：projection、
  成功 File、非成功官方 fallback、PDF icon、Download DOM contract；不点击下载。
- 现有 Host 公共入口集成测试增加该 Plugin 的安装和 AppUIModel 启用覆盖。

初次实现提交 `42fa6c6` 按“做完推送，不要验收”交付，当时未运行测试、
typecheck、build、上游检查或人工 UI 验收。

## 最终验证记录（2026-09-27）

用户随后授权执行以下验证。React typecheck 首次发现集成测试对全部消息
`flatMap(message.content)` 时混合 assistant/user part union 的类型错误。
修复为只收集 assistant message content；最终 typecheck 和 React focused tests 均通过。
生产实现未作修改。

| 验证命令 | 最终结果 |
| --- | --- |
| `pnpm --filter @agent-ui/mock-agent exec vitest run tests/file-output.test.ts` | 1 test passed |
| `pnpm --filter @agent-ui/react exec vitest run tests/migrated/generated-file-ag-ui-integration.test.tsx tests/migrated/generated-file-message.test.tsx` | 2 files / 23 tests passed |
| `pnpm --filter @agent-ui/project-control exec vitest run tests/host-public-entry.integration.test.ts` | 4 tests passed |
| `pnpm --filter @agent-ui/mock-agent typecheck` | Passed |
| `pnpm --filter @agent-ui/mock-agent build` | Passed |
| `pnpm --filter @agent-ui/react typecheck` | Passed |
| `pnpm --filter @agent-ui/react build` | Passed; public declaration boundary OK |
| `pnpm --filter @agent-ui/source-registry typecheck` | Passed |
| `pnpm --filter @agent-ui/source-registry build` | Passed |
| `pnpm --filter @agent-ui/project-control typecheck` | Passed |

共 28 个 focused tests 通过。验收重点对应如下：

| 验收重点 | 通过的证据 |
| --- | --- |
| 1. `TOOL_CALL_RESULT.content` 仍为 string | Mock protocol test 对真实 scenario 事件进行 AG-UI schema parse 并断言 string 和 JSON 内容 |
| 2. 没有 CUSTOM | 同一 protocol test 明确断言无 `EventType.CUSTOM` |
| 3. react-ag-ui 将 JSON string 转为 result object | 集成测试经过真实 Mock SSE / HttpAgent / ConversationRuntimeProvider，读取 assistant tool-call.result 对象 |
| 4. `generate_file` 不进入 `RunAgentInput.tools` | 集成测试检查真实发出的请求 tools |
| 5. named renderer 命中 `GenerateFileToolUI` | Plugin Toolkit 注册 identity 断言，集成测试只安装该 Toolkit、保留官方 fallback 后实际渲染 File 下载入口 |
| 6. `quarterly-report.pdf` 显示 | Tool UI 和 File DOM 测试断言文件名 |
| 7. Download href 为虚拟 URL | File DOM 和集成测试断言精确 href |
| 8. download 为 `quarterly-report.pdf` | File DOM 和集成测试断言精确 download 属性 |
| 9. malformed/error/running 使用 ToolFallback | Tool UI 参数化测试断言官方 fallback DOM 存在、File DOM 不存在；同时覆盖 incomplete/requires-action |
| 10. 普通 Assistant 文本正常出现 | 集成测试断言页面包含 `报告已经生成。` |

本轮是协议、真实 adapter 集成、DOM contract、Host 初始化/打包和 Type / Build
验证；未进行浏览器人工点击下载或远程 URL 可用性检查。
pnpm 的 node_modules/lockfile 配置提示和 Vite 对未来 native config loader 的提示
未阻止上述命令通过。

## 后续升级边界

升级 AG-UI 1.0 后重新评估 `TOOL_CALL_RESULT` 的 `ContentPart[]`，并确认
react-ag-ui 对 typed Tool Result 的完整支持。如果支持 Backend File ContentPart
直接转换为 assistant-ui native file part，可迁移并删除当前 Tool-local
JSON result → File Tool UI 层。此阶段不定义全局 file result protocol，
也不 patch AG-UI 或 fork react-ag-ui。
