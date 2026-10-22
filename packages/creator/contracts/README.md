# Creator tooling contracts

本目录是 Creator 开发工具链协议和共享测试数据的唯一源码位置，不是独立 workspace/npm 包，也不是生成前端的生产依赖。

- `creator/`：Node Host、Python sidecar 和内部 Operator 共用的 JSON Schema、operation inventory 与合法/非法 golden fixtures，见 [说明](creator/README.md)。
- `fixtures/`：TypeScript 和 Python 共用的工程路径规则测试数据。

Operator 实现位于 `../operator`。Creator npm 包和 Python wheel 自动收集所需协议文件并校验字节一致性；不要手工维护发布副本。迁移文件位置不应改变 Schema `$id`、协议字段或版本。
