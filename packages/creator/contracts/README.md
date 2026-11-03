# Creator tooling contracts

本目录是 Creator 开发工具链协议和共享测试数据的唯一源码位置，不是独立 workspace/npm 包，也不是生成前端的生产依赖。

- `creator/`：Node Host、TypeScript Agent 和内部 Operator 共用的 JSON Schema、operation inventory 与合法/非法 golden fixtures，见 [说明](creator/README.md)。
- `fixtures/`：工具链共用的工程路径规则测试数据。

内部 Operator 实现位于 `packages/creator/operator`。Creator 构建从此处复制协议到 `dist/contracts/creator`，Agent 与 Operator 使用同一 canonical 源。不要手工维护发布副本；迁移语言不改变既有 Schema `$id`、领域协议字段或版本，运行时身份使用 `typescript`。
