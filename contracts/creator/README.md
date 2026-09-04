# Creator cross-language contracts

这些 JSON Schema 冻结 Creator TypeScript host、Python sidecar 与目标项目之间的
Phase 0 边界。协议版本变化必须先更新这里的 schema 与 golden fixtures，再修改
任一语言实现。

- `creator-transport.schema.json`：Vite 与 Python sidecar 的 handshake、health、
  AG-UI request/event stream 和 runtime diagnostics envelope。
- `project-control.schema.json`：Python/TypeScript Creator 与目标项目固定脚本之间的
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
