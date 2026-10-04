# Creator cross-language contracts

这些 JSON Schema 冻结 Creator Node host、Python sidecar 与目标项目之间的
Phase 0 边界。协议版本变化必须先更新这里的 schema 与 golden fixtures，再修改
任一语言实现。

- `creator-transport.schema.json`：Vite 与 Python sidecar 的 handshake、health、
  AG-UI request/event stream 和 runtime diagnostics envelope。
- `project-control.schema.json`：Python Creator 与目标项目固定 TypeScript 脚本之间的
  stdin/stdout 协议。
- `app-ui-model-operation.schema.json`：`mutate_app_ui_model` 的领域操作。
- `creator-receipt.schema.json`：Creator 完成回执。
- `creator-host-results.schema.json`：Host validation 与 Composition Fast Path
  的冻结结果 envelope。

AG-UI 的完整消息与事件定义仍由 `@ag-ui/core` / `ag-ui-protocol` 所有；这里仅冻结
Creator transport 使用的 envelope 和 Phase 1 echo lifecycle，不复制完整 AG-UI
规范。AppUIModel 的完整业务不变量仍由目标项目 Zod contract 和
`ui-project-control.ts` 唯一实现。

`fixtures/` 是 TypeScript 与 Python 共同消费的 golden source。两侧测试都会对
这些值执行 Draft 2020-12 JSON Schema validation；fixture 与 schema 任一侧漂移
都必须使统一测试门禁失败。

ProjectControl 的唯一 canonical wire contract 是
`contracts/creator/project-control.schema.json`，operation inventory 是同目录下的
`project-control.operations.json`。TypeScript Zod request parsing 是 Host 实现细节，
Python Literal/client methods 是 transport bindings；两者均不独立定义协议。
Agent Tool exposure 是单独的授权面：remove transport capability 不代表模型删除权限。

成功 envelope 保持当前结构，不增加 operation 字段。Host 与 Python 根据请求 operation
使用同一份 operation-specific Result `$defs`；envelope 的 Result union 不能替代
request-scoped validation。内部复杂对象仅在显式标记 opaque 的局部放宽，
AppUIModel model/layout/slot 继续由现有目标项目 Zod grammar 管理，不复制新的 grammar。
Source inspection 使用现有 `availableVersion` / optional `installedVersion`，不新增
Host 没有返回的 `kind` 字段。

`fixtures/project-control/manifest.json` 列出所有合法与非法 request/result fixtures；
TS 与 Python suite 必须和 canonical JSON Schema 同时 accept/reject。
`pnpm check:project-control-contract` 检查 operation、input/result binding、Host switch
与声明的 Tool exposure；Python regression 额外检查实际 Tool 集合。
字段删除、改名、类型变化或 response envelope 变化必须升级至 v4。
