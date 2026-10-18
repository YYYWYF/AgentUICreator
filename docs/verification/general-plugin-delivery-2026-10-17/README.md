# 官方插件通用交付验证（2026-10-17）

本轮把 Composer 的交付规则抽为 catalog/recipe 驱动能力，并接入六个现代插件：`copy-action`、`reload-action`、`feedback-actions`、`export-markdown-action`、`reasoning`、`tool-group`。连同 Composer，共七个现代 npm 入口；旧 `assistant-ui-composer` 保持兼容。其余官方插件尚未全部迁移。

## 已验证行为

- Plugins 的唯一展示实现生成 npm 入口和 portable source；服务元数据、公开声明边界与源码/运行摘要校验通过。
- 默认薄应用层引用 npm；普通 props 修改不产生 ownership。推理组、工具组通过 Host 已有语义 scope 将 group/children 传给组件，没有复制 Runtime 或 Context。
- 六个插件逐项执行严格 TypeScript 检查与真实 Vite 构建，验证 npm 模式、确认后的提取阶段、源码合并阶段。
- 应用层原有内容（包括中文注释、CRLF）保留；接管只切换静态 import，保留插件/实例 ID 和 AppUIModel 原字节。拒绝或未确认不提取源码。
- 替换包后，本地源码、ownership/BASE 和应用层字节不变；BASE/LOCAL/TARGET 冲突要求显式合并，合并同时保留本地修改与候选新功能，验证成功后才推进版本。
- 同一个 ID 只注册一次；已有旧 source-lock 或未带锁的有效迁移前源码继续优先使用，不覆盖定制、不自动生成同意或新 BASE。
- 旧安装 catalog 不会被自动加入新包才具有的入口；缺失接口、共享 API 不兼容和元数据摘要异常拒绝写入。
- 实际组件验证复制文本、反馈对象、重试 preventDefault、导出菜单 DOM 属性/事件、推理及工具组展开/样式/children。

## 检查记录

- Plugins、Operator build/typecheck；`verify:sources`：386 份快照及 portable/runtime 摘要一致。
- Plugins 相关 Vitest：21 项通过（实际交互、Composer Context、响应归属和源码目录）。
- Operator 相关 Vitest：46 项通过，详见 `validation.json`，涵盖六个插件完整生命周期、旧包兼容、Composer 回归、元数据权威、官方资源和 Windows process helper。
- Python：82 项通过（接管原生确认/拒绝、实际 LangGraph 恢复、通用准入、源码修改、完成检查及 grounding）。
- Composer 独立 bundle/旧入口使用 Node test runner：2 项通过。该 `.mjs` 使用 `node:test`，不能以 Vitest 的“No test suite”作为功能失败。
- `pnpm check:i18n`：failures 为空；`git diff --check` 通过。
- 三个示例 Host 的新入口/共享 support 别名解析检查通过；Workbench preview-tests typecheck 通过。显式关闭依赖发现的浏览器 fixture 同时预编译共享 support 入口，保持包组件与提取源码使用同一个 Context。
- 本地 npm tarball 内容检查见 `tarball.json`。未发布 npm。

扩大检查并非全绿：本轮曾运行全 Plugins 套件，681 通过、44 失败、9 跳过，另有一个 node:test 文件被 Vitest 收集报无 suite；扩大 Operator 选择集为 116 通过、20 失败。失败包括仍引用旧 `assistant-ui-*` 路径/名称、旧 Composer fixture/catalog、预设/主题旧断言，以及仅伪造 package.json、缺少真实包 exports 的 purge 初始化 fixture。按用户要求没有扩展修复这些历史 fixture；这些扩大运行发生在最后的接口/旧包兼容补充之前，不能称为最终全套通过或已逐项证明均为既有失败。最终针对本次能力的检查单独列出。

## 浏览器证据与边界

[截图：生成 Host 的薄应用层 props](generated-host-thin-props.png)、[截图：接管后加载本地实现](generated-host-owned-source.png)。这是真实初始化工程、真实 npm 组件和真实浏览器。本地 AG-UI 服务产生回复后，复制按钮收到应用层的 padding/backgroundColor；随后在临时工程执行 Operator 接管，验证只切换 import、修改提取源码并重载，DOM 出现本地实现标识且原应用层样式保留，整个过程无 pageerror。浏览器接管由测试直接调用 Operator，用户确认本身由上述真实 LangGraph 测试验证。重放脚本为仓库 `scripts/verify-general-plugin-delivery.mts`，使用已构建的 Plugins/Operator。

这轮浏览器检查没有调用真实模型，也没有重跑此前的完整 Creator 模型接管流程。确认机制由实际 LangGraph interrupt/resume 测试覆盖；源码升级目标采用临时工程里的候选版本，未声称同步了真实新上游发行版。

Windows 相关检查包括逻辑路径/声明保留、win32 helper fixture，以及中文/空格路径与 CRLF 的生命周期检查。没有原生 Windows 执行环境，不能作为 Windows 实机验收。旧工程自动拆分应用层与实现仍待后续显式迁移。
