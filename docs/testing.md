# 主流程测试

测试围绕当前支持的用户流程维护。同一行为优先保留一条完整集成测试；仅在职责或运行环境不同、确实存在独立风险时补充检查。

| 范围 | 保留的主要流程 |
| --- | --- |
| Creator | 工程选择与初始化、切换工程、Agent 持续执行与取消/确认、应用层编辑、开发入口与进程生命周期 |
| Plugin 与布局 | 默认 npm 交付、启停与缺失文件准备、AppUIModel 事务、Slot 与服务组合、显式源码接管及实现同步 |
| 更新 | 官方兼容信息、具体计划确认、真实 npm/pnpm 安装与版本核对、保留应用定制及源码 BASE |
| 对话 | 消息发送与流式展示、停止、多会话、审批与信息收集、前端工具与业务事件、历史与运行恢复 |
| 组件 | 已交付包的公开 props/组合入口、Composer 与引用、语言/主题切换、Portal 与宿主隔离 |
| Mock | 官方场景、当前工程本地 JSONL、独立服务和预览入口、项目切换与运行恢复 |
| 发行与平台 | 包入口、消费者类型、生产独立构建、Web Component、Windows 路径/进程/锁文件处理 |

## 日常检查

在仓库根目录运行：

```sh
pnpm test
pnpm typecheck
```

`pnpm test` 准备本地包和示例，再运行工作区保留的测试。测试不会调用真实模型。

`pnpm dev` 只准备依赖、生成构建资源、编译并启动服务。依赖精确版本审计、发布兼容性、Plugin 服务声明、Lexical/公开类型/可选适配器边界和示例工程审计不接入启动或普通包构建；这些检查通过下面的手动命令运行。构建仍会报告编译、缺失输入、文件操作和进程启动错误。

按修改范围使用对应包的 `test`，或通过 `exec vitest run` 指定一个现有主流程文件。内部 Operator 使用 Creator 的 `test:operator`。本地测试和构建通过，不代表浏览器视觉或真实 Windows 已验收。

文档生成与资源复制测试通过外网环境中的 `pnpm test:documentation` 显式运行，不接入内网的安装、启动、构建、打包、验包和发布流程。`pnpm test:locale-reference` 单独测试语言参考生成。内网只部署静态网站；Creator 的离线文档存在时作为静态资源原样拷贝，缺失时跳过。

## 专项验证

- `pnpm check:build`：构建完成后，检查依赖精确版本、Core/Renderer/Plugins/Runtime/Creator 的兼容元数据、Plugins 交付资源与服务声明，以及 Runtime 公开类型边界；不重新构建或安装消费者依赖。
- `pnpm check:dependency-pins`：单独审计依赖精确版本，不再作为安装前置步骤。
- `pnpm check:release-metadata`：检查全部六个公开包的兼容元数据，需要先构建对应包。
- `pnpm check:examples`：检查维护示例的工程状态、模板 Mode 和源码目录；日常启动只初始化缺失工程，不审计已有工程。
- `pnpm --filter @za38.03/agent-ui-runtime check:consumer-types`：发布包的隔离安装与严格消费者类型检查，需要访问 npm registry 或使用本地缓存。
- `pnpm check:react-compat`：按支持的 React 版本运行隔离消费者检查。
- `pnpm verify:package`：实际 tarball、公开入口与独立消费者。
- `pnpm test:web-component`：Web Component 发行、安装、类型和浏览器嵌入。
- `pnpm verify:assistant-ui-upgrade`：上游升级契约及宿主隔离。
- `pnpm --filter @za38.03/agent-ui-creator-workbench test:e2e`：Creator 命令与生产运行刷新恢复。
- 同包的 `test:e2e:agent-connection` 和 `test:e2e:theme-commands`：独立生成工程的连接、插件启用/同步与主题操作。

## 保留与删除标准

保留测试应对应当前公开能力、可复现的用户流程或必要的数据保护/平台边界。主流程测试保留有意义的结果、确认和定制保护断言。

旧源码目录夹具、已撤回能力、重复组件/辅助函数测试、固定文案和内部源码形状快照，以及阶段性截图、修复对比、冻结模型实验不再作为长期测试保留。阶段验收需要的材料与产品源码分开保存。

不要为每个低影响修改增加一个永久测试。优先在相关主流程中增加有意义的断言；也不要因为测试失败就删除它、跳过它或把失败改成预期成功。
