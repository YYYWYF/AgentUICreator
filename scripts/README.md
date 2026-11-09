# Workspace scripts

本目录包含开发、测试、发布入口及维护工具。从仓库根目录使用 `pnpm <command>`；Creator Agent 与内部 Operator 统一用 Node.js 构建和运行。

| 用途 | 入口或共用模块 |
| --- | --- |
| 日常开发 | `dev-workbench.mjs`、`../apps/creator-workbench/dev.ts`、`prepare-workbench.mjs`、`start-creator-workbench.mjs`、`ensure-workspace-dependencies.mjs` |
| 构建与准备 | `build-workspace.mjs`、`build-public-packages.mjs`、`prepare-host-packages.mjs`、`preparation-state.mjs` |
| 跨平台进程 | `pnpm-process.mjs`；新增 pnpm 调用复用此模块，避免自行调用 Windows `.cmd` |
| 测试与类型检查 | `test-workspace-ts.mjs`、`typecheck-workspace.mjs`、`generated-source-test-config.ts`、同名 `.test.*` |
| 示例 Host | `host-examples/`：初始化、检查、重置和维护示例项目绑定 |
| 包发行 | `version-packages.mjs`、`sync-package-release-metadata.mjs`、`prepare-compatibility-release.mjs`、`verify-public-packages.mjs`、`creator-documentation.mjs` |
| assistant-ui 维护 | `update-assistant-ui.mjs`、`assistant-ui-workspace-packages.mjs`、`generate-assistant-ui-upgrade-report.mjs`、`check-assistant-ui-*.mjs`、`check-ag-ui-lockfile.mjs`、`check-generative-ui-resource.mjs` |
| 其他检查 | `check-dependency-pins.mjs`、`check-operator-contract.mjs`、`check-react-compat.mjs`、`verify-dev-startup.mjs` |
| 国际化 | `audit-ui-copy.mjs`；语言与主题行为由主流程测试和 Web Component 嵌入测试覆盖 |
| 手动维护 | `audit-packed-plugin-sources.mts`（包内容审计）、`package-repository.mjs`（仓库与静态文档 ZIP 打包） |

Creator 发行使用 `packages/creator` 的 `build` 和 `pnpm pack`。Agent、Operator、契约、提示词及浏览器工作台随同一个 `@za38.03/agent-ui-creator` 包交付，不再生成 Python wheel 或各平台运行包。公开清单共六个独立版本的 API 包。

`pnpm release:version` 一次完成识别改动、升版、提交和自动打标签。命令通过 `pnpm view` 分别查询六个包在 npm 上实际存在的最高稳定版本，沿用仓库 `.npmrc`、scope registry 和凭据；包单独设置 `publishConfig.registry` 时查询该发布源。已发布包的源码指纹决定是否有新改动，默认升一个 patch，并联动需要新依赖版本的公开包。内部数字依赖/peer 和当前模板资源的依赖声明同步为准确版本；`workspace:*` 保留，由 pnpm 打包时转换为准确版本。锁文件通过 `pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile` 更新，不增加工具依赖，也不接入构建、测试或发布流程。

命令将当前包源码、相关脚本、根 TypeScript/包配置和锁文件一起提交，自动创建 `release-时间-提交号` 格式的本地 annotated tag；目录外的无关暂存改动保留。标签标记准备发布的源码，不是发布成功的依据。只推送但没跑流水线时，同一源码复用已有标签；有新源码也保留尚未发布的目标版本。npm 确认该版本已存在后，后续改动才进入下一版本。流水线部分发布时逐包识别已发布/待发布状态，已发布且要求未变化的包不重复升版。通过正常 Git 流程推送该提交及标签（例如 `git push --follow-tags`），再手动运行原流水线。

npm 返回包不存在（404）时按首次发行处理并保留当前初始版本；网络、认证或元数据读取失败会在修改文件前停止，不推断为“未发布”。每个待发包的 `package.json.agentUISource` 记录源码指纹和本轮内部依赖版本，这些元数据随原流水线自然发布，构建生成的兼容清单不会覆盖它。旧已发布包没有该字段时使用其 npm `gitHead` 定位源码；旧元数据也缺少 `gitHead` 时，用 `--since <上次实际发布的tag或commit>` 一次性补充源码基准。仅有标签不会被认作发布成功。

识别包括已提交、未提交和未忽略的新文件，排除 Git 忽略的生成产物；包内文件、使用的共享脚本、根 TypeScript 配置及根 pnpm 覆盖/引擎配置属于识别范围，单独修改网站或示例不触发包升版。可先执行 `pnpm release:version --dry-run` 查看清单；新增功能或破坏性变更由维护者选择 `--bump minor` / `--bump major`，源码差异本身不能推断 API 兼容性。现有发布流水线继续负责构建、发行资料与发布。

`pnpm package:repo [output.zip]` 打包仓库，ZIP 中的 `website/` 固定为完整静态站点；`pnpm docs:zip [output.zip]` 只构建并打包静态 `website/`，默认输出 `../AgentUIWebsite.zip`，不生成 Creator 离线文档。两者保留工作区源码，部署服务器无需 Node.js 或 npm 依赖。

website 相关 `.mjs` 只用于外网源码环境。内网安装、启动、构建、打包、验包和发布不校验 documentation；Creator 的普通资源拷贝步骤在 `artifacts/creator-documentation/` 存在时原样复制，缺失时跳过。内网 ZIP 二次打包直接收集静态 `website/`，不编译网站、不检查网站清单。`docs:package`、`test:documentation` 留作外网手动入口，不接入内网主流程。

启动、发行和集成 CI 不再前置安装或生成文档。文档站 `build` 只编译站点；语言参考表与文档结构检查通过 `docs:locales:check`、`pnpm --dir website check:docs` 手动运行。`verify:package` 在独立消费目录中移除可选的离线文档后验证 Creator 启动和工程操作。

`pnpm dev` 只准备依赖、生成资源、编译并启动服务，不执行额外审计。构建后的依赖版本、发布兼容元数据、Plugin 服务声明和边界检查通过 `pnpm check:build` 手动运行；`pnpm check:dependency-pins`、`pnpm check:release-metadata` 和 `pnpm check:examples` 提供独立入口。依赖精确版本审计不再接入 `preinstall`。发布元数据生成保留在构建/prepack 中，发布审核仍由显式检查和 `prepublishOnly` 执行。`pnpm test`、`pnpm typecheck` 和其他 `check:*` / `verify:*` 按修改范围运行。

根入口 `pnpm dev` 会持续监听上述五个开发包（Core、Renderer、Plugins、Runtime、Creator，含 Operator）的源码、资源及构建配置，合并保存后按依赖顺序重建受影响包并重启开发服务，保留原来选中的工程。运行或等待确认中的 Creator 任务结束/停止后才重启；编译失败后继续监听，修复保存会重试。普通应用文件继续使用 Vite 热更新；不会自动重写已有工程或推进源码 BASE。监听与重启逻辑位于 Workbench 的 TypeScript 模块，不新增 `.mjs` 入口。

`pnpm verify:package` 检查包归属、真实 tarball 的公开入口、消费者类型和生产应用独立构建。`packages/creator/tests/creator-node-process.test.ts` 验证 Node Agent 的认证握手与启动/退出；浏览器功能验收单独记录，不能用这些检查替代。

`.d.mts` 是 JavaScript 模块的 TypeScript 类型声明，不是独立执行入口。没有 package 命令直接引用的 helper 和测试也不能据此删除。

## 历史验收

2026 年 10 月的 22 个历史验收入口及其专用 registry helper 已删除，不保留归档副本。它们没有接入当前 package 命令或 CI。

旧升级夹具、一次性生产包准备、按需加载浏览器控制和工具结果截图脚本也已移除。当前升级与工具结果行为由现有主流程测试覆盖；完整按需生产构建比较仍使用 `verify-plugin-demand-build.mjs`。截图来源记录保留当时的历史脚本路径。

Python 构建、启动和验证入口已移除；直接使用 `pnpm creator` 或 `pnpm dev`。

测试范围和执行方式见[主流程测试](../docs/testing.md)。

## 维护约定

- 长期检查先提供可重复执行的入口，再决定是否接入 package 命令或 CI。
- 特定会话或阶段验收结束后，删除不再维护的入口及其专用 helper；可重复使用的检查转为长期测试。
- 路径定位使用 `fileURLToPath()` 和 native path API，模块路径及文档路径保持 `/`。
