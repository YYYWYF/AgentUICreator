# 已取代的提案：默认插件源码交付

2026-10-17：此前“官方插件默认全部源码安装到用户工程”的提案已被后续用户决策取代，尚未据此迁移运行代码。

当前唯一交付决策见 [统一 Plugins 包、内置源码目录与按需源码托管](npm-default-plugin-source-ownership.md)：

- Plugins 维护唯一官方实现，默认通过一个 npm 包提供插件。
- 原 Source Registry 合并到同一个 Plugins 包，作为内置 catalog 与源码快照能力，不再独立发包或另维护一套实现。
- Creator 必须先取得用户对具体插件的明确同意，才由 Operator 提取当前包版本源码并切换为本地实现。
- 包升级不覆盖已托管源码；用户要求同步时，以准确 BASE / LOCAL / TARGET 合并并验证。
- Core、Renderer、Runtime 继续使用 npm；不默认接管、不退役统一 Plugins 包。

保留此路径仅为旧链接导航。具体实施清单、授权边界、共享依赖限制和验收要求均以上述新文档为准。
