# Creator tooling contracts

本目录是 Creator 开发工具链协议和共享测试数据的唯一源码位置，不是独立 workspace/npm 包，也不是生成前端的生产依赖。

- `creator/`：Node Host、Python sidecar 和内部 Operator 共用的 JSON Schema、operation inventory 与合法/非法 golden fixtures，见 [说明](creator/README.md)。
- `fixtures/`：TypeScript 和 Python 共用的工程路径规则测试数据。

TS Operator 实现位于 `packages/operator`。Operator 构建、Creator Python 平台 npm 包和开发用 Python wheel 从本目录自动收集所需协议；平台包的 Python 资源位于 `dist/agent/agent_ui_creator/_contracts/creator`，与 canonical 源校验字节一致性。Creator 入口 npm 包不再包含第二份 `dist/python/agent_ui_creator` 源码。不要手工维护发布副本，迁移位置不改变 Schema `$id`、协议字段或版本。
