# Workspace scripts

本目录只保留开发、测试、发布的现行入口，以及可独立使用的维护工具。根目录及各 package 的命令名称和参数保持不变；从仓库根目录使用 `pnpm <command>`。

| 用途 | 入口或共用模块 |
| --- | --- |
| 日常开发 | `dev-workbench.mjs`、`prepare-workbench.mjs`、`start-creator-workbench.mjs`、`start-creator-python.mjs`、`ensure-workspace-dependencies.mjs` |
| 构建与准备 | `build-workspace.mjs`、`build-public-packages.mjs`、`prepare-host-packages.mjs`、`preparation-state.mjs` |
| 跨平台进程 | `pnpm-process.mjs`；新增 pnpm 调用复用此模块，避免自行调用 Windows `.cmd` |
| 测试与类型检查 | `test-workspace-ts.mjs`、`typecheck-workspace.mjs`、`run-python-tests.mjs`、`generated-source-test-config.ts`、同名 `.test.*` |
| 示例 Host | `host-examples/`：初始化、检查、重置和维护示例项目绑定 |
| 包发行 | `sync-package-release-metadata.mjs`、`prepare-compatibility-release.mjs`、`verify-public-packages.mjs`、`verify-creator-distribution.mjs`、`verify-creator-package.mjs`、`verify-creator-python-wheel.mjs`、`test-creator-package-runtime.mjs`、`creator-distribution-helpers.mjs` |
| assistant-ui 维护 | `update-assistant-ui.mjs`、`assistant-ui-workspace-packages.mjs`、`generate-assistant-ui-upgrade-report.mjs`、`check-assistant-ui-*.mjs`、`check-ag-ui-lockfile.mjs`、`check-generative-ui-resource.mjs` |
| 其他检查 | `check-dependency-pins.mjs`、`check-operator-contract.mjs`、`check-react-compat.mjs`、`verify-dev-startup.mjs`、`verify-creator-workbench.mjs` |
| 国际化与视觉 | `audit-ui-copy.mjs`、`test-i18n-plugin-visual.mjs`、`report-i18n-plugin-visual.mjs` |
| 手动维护 | `audit-packed-plugin-sources.mts`（包内容审计）、`verify-project-upgrades.mjs`（升级验证）、`package-repository.mjs` / `.py`（仓库打包） |

Creator 的现行发行由 `packages/creator/python/build_sidecar.py` 在 Python 构建任务生成平台 npm artifact，再由 `restore-creator-sidecars.mjs` 在 Node 任务还原；`--all` 可单独使用默认产物目录，也可与显式目录组合。`creator-sidecar-audit.mjs` 从平台 tarball 的 `dist/agent` 读取 Python 源码；`creator-node-artifact-audit.mjs` 分别检查 Creator 的薄入口和 Operator 的实际 bundle、presets、更新 UI/API，完整审计使用七包清单。`verify-creator-python-wheel.mjs` 仅供 Python 开发包验收，不是 Node 发行的前置依赖。

`pnpm verify:creator-workbench --skip-build --npm` 用全新 npm 缓存和仓库外消费者验证只安装 Creator。安装只提供 Node PATH，CLI/Python 启动使用空 PATH；`creator-installed-runtime-smoke.mjs` 被复制到消费者内独立执行，检查包内 Python 的真实路径、健康状态、重启和退出，避免测试进程复用仓库模块。

`.d.mts` 是 JavaScript 模块的 TypeScript 类型声明，不是独立执行入口。没有 package 命令直接引用的 helper 和测试也不能据此删除。

## 历史验收

2026 年 10 月的 22 个历史验收入口及其专用 registry helper 已删除，不保留归档副本。它们没有接入当前 package 命令或 CI。

旧的 `start-creator-python.sh` 已移除；统一使用 `pnpm creator:python`，对应跨平台 `start-creator-python.mjs`。其余现行命令入口未移动。

## 维护约定

- 长期检查先提供可重复执行的入口，再决定是否接入 package 命令或 CI。
- 特定会话或阶段验收结束后，删除不再维护的入口及其专用 helper；可重复使用的检查转为长期测试。
- 路径定位使用 `fileURLToPath()` 和 native path API，模块路径及文档路径保持 `/`。
