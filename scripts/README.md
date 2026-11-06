# Workspace scripts

本目录包含开发、测试、发布入口及维护工具。从仓库根目录使用 `pnpm <command>`；Creator Agent 与内部 Operator 统一用 Node.js 构建和运行。

| 用途 | 入口或共用模块 |
| --- | --- |
| 日常开发 | `dev-workbench.mjs`、`prepare-workbench.mjs`、`start-creator-workbench.mjs`、`ensure-workspace-dependencies.mjs` |
| 构建与准备 | `build-workspace.mjs`、`build-public-packages.mjs`、`prepare-host-packages.mjs`、`preparation-state.mjs` |
| 跨平台进程 | `pnpm-process.mjs`；新增 pnpm 调用复用此模块，避免自行调用 Windows `.cmd` |
| 测试与类型检查 | `test-workspace-ts.mjs`、`typecheck-workspace.mjs`、`generated-source-test-config.ts`、同名 `.test.*` |
| 示例 Host | `host-examples/`：初始化、检查、重置和维护示例项目绑定 |
| 包发行 | `sync-package-release-metadata.mjs`、`prepare-compatibility-release.mjs`、`verify-public-packages.mjs`、`creator-documentation.mjs` |
| assistant-ui 维护 | `update-assistant-ui.mjs`、`assistant-ui-workspace-packages.mjs`、`generate-assistant-ui-upgrade-report.mjs`、`check-assistant-ui-*.mjs`、`check-ag-ui-lockfile.mjs`、`check-generative-ui-resource.mjs` |
| 其他检查 | `check-dependency-pins.mjs`、`check-operator-contract.mjs`、`check-react-compat.mjs`、`verify-dev-startup.mjs` |
| 国际化 | `audit-ui-copy.mjs`；语言与主题行为由主流程测试和 Web Component 嵌入测试覆盖 |
| 手动维护 | `audit-packed-plugin-sources.mts`（包内容审计）、`package-repository.mjs`（仓库与静态文档 ZIP 打包） |

Creator 发行使用 `packages/creator` 的 `build` 和 `pnpm pack`。Agent、Operator、契约、提示词及浏览器工作台随同一个 `@za38.03/agent-ui-creator` 包交付，不再生成 Python wheel 或各平台运行包。公开清单共六个独立版本的 API 包。

`pnpm package:repo [output.zip]` 打包仓库，ZIP 中的 `website/` 固定为完整静态站点；`pnpm docs:zip [output.zip]` 只构建并打包静态 `website/`，默认输出 `../AgentUIWebsite.zip`，不生成 Creator 离线文档。两者保留工作区源码，部署服务器无需 Node.js 或 npm 依赖。

website 相关 `.mjs` 只用于外网源码环境。内网安装、构建与 npm 打包不调用它们；Creator 的普通资源拷贝步骤直接复制交接包中的 `artifacts/creator-documentation/`。内网 ZIP 二次打包直接收集静态 `website/`，不编译网站、不检查网站清单。`docs:package`、`docs:check`、`test:documentation` 留作外网手动入口，不接入内网主流程。

日常入口是 `pnpm dev`、`pnpm test`、`pnpm typecheck`。`check:*` / `verify:*` 按修改范围使用，无需每次全部执行；依赖精确版本检查已在安装前执行，CI 不再重复调用。上游兼容、真实包消费者和 Windows 路径分别覆盖独立边界，继续保留；文档源码交接校验只在外网显式执行。

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
