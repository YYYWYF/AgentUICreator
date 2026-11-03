# Creator tooling contracts

这些 JSON Schema 冻结 Creator Node Host、TypeScript Agent 与目标项目之间的
工具边界。协议版本变化必须先更新这里的 schema 与 golden fixtures，再修改
任一实现。

- `creator-transport.schema.json`：Vite 与 Node Agent 的 handshake、health、
  AG-UI request/event stream 和 runtime diagnostics envelope。
- `operator.schema.json`：Creator Agent 与目标项目固定 Operator 脚本之间的
  stdin/stdout 协议。
- `app-ui-model-operation.schema.json`：`mutate_app_ui_model` 的领域操作。
- `creator-receipt.schema.json`：Creator 完成回执。
- `creator-host-results.schema.json`：Host validation 与 Composition Fast Path
  的冻结结果 envelope。

AG-UI 的完整消息与事件定义仍由 `@ag-ui/core` 所有；这里仅冻结
Creator transport 使用的 envelope 和 Phase 1 echo lifecycle，不复制完整 AG-UI
规范。AppUIModel 的完整业务不变量仍由目标项目 Zod contract 和
`ui-operator.ts` 唯一实现。

`fixtures/` 是 Agent 与 Operator 共用的 golden source。Node 测试会对
这些值执行 Draft 2020-12 JSON Schema validation；fixture 与 schema 任一侧漂移
都必须使统一测试门禁失败。

Operator 的唯一 canonical wire contract 是
`packages/creator/contracts/creator/operator.schema.json`，operation inventory 是同目录下的
`operator.operations.json`。TypeScript Zod request parsing 是 Host 实现细节，
Agent client methods 是 transport bindings；两者均不独立定义协议。
Agent Tool exposure 是单独的授权面：remove transport capability 不代表模型删除权限。

成功 envelope 保持当前结构，不增加 operation 字段。Host 与 Agent 根据请求 operation
使用同一份 operation-specific Result `$defs`；envelope 的 Result union 不能替代
request-scoped validation。内部复杂对象仅在显式标记 opaque 的局部放宽，
AppUIModel model/layout/slot 继续由现有目标项目 Zod grammar 管理，不复制新的 grammar。
Source inspection 使用显式 `owned` / 内容 SHA 驱动的 `updateAvailable`，不新增
Host 没有返回的 `kind` 字段。
一次性导入的业务示例另以可选 `projectOwned` 标记；它没有官方源码 BASE，
不参与内容更新比较，`updateAvailable` 为 false。

`fixtures/operator/manifest.json` 列出所有合法与非法 request/result fixtures；
Operator request/result 实现必须和 canonical JSON Schema 同时 accept/reject。
`pnpm check:operator-contract` 检查 operation、input/result binding、Host switch
与声明的 Tool exposure；Agent regression 检查工具授权和实际执行。
字段删除、改名、类型变化或 response envelope 变化必须升级至 v4。

`inspect_ui_plugin.application.usageGuide` 是可选的有界导航数据，包含当前应用
示例、已解析的公开定制入口和实际安装包身份（可用时）。它不授予源码接管、
写入或文件读取证据；公开类型不可用时仍可返回应用示例，不能据此推断能力缺失。

协议源码位于 `packages/creator/contracts/creator`，由 Creator 统一拥有。TS Operator 实现位于 `packages/creator/operator`。Agent 与内部 Operator 随同一个 Creator npm 包交付，构建复制所需协议至 `dist/contracts/creator`；不再有独立语言 artifact。
