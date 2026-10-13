# 公司依赖版本重新验证（2026-10-13）

## 版本与范围

按本轮用户要求同步活动 workspace package manifests、Source Registry 的 Web Component integration package requirements、根 `pnpm.overrides` 和 `pnpm-lock.yaml`。保留已有未提交源码改动、历史 fixtures 和 vendor。peerDependencies 的消费者兼容范围不改为安装版本。

| Package | Exact version |
| --- | --- |
| `@assistant-ui/core` | `0.3.27` |
| `react` | `19.1.1` |
| `react-dom` | `19.1.1` |
| `react-test-renderer` | `19.1.1` |
| `@assistant-ui/store` | `0.3.19` |
| `@assistant-ui/tap` | `0.9.23` |
| `assistant-stream` | `0.3.50` |
| `assistant-cloud` | `0.2.6` |
| `@vitejs/plugin-react` | `6.0.2` |
| `@vitejs/plugin-vue` | `6.0.1` |
| `vue-tsc` | `3.0.6` |
| `vue` | `3.5.42` |
| `@types/semver` | `7.7.1` |
| `@types/node` | `26.6.2` |
| `tailwind-merge` | `3.6.0` |
| `@types/jsdom` | `28.0.3` |

环境：macOS / Node 24.20.0 / pnpm 8.12.0。当前全量状态有既存源码与测试合同问题；本次未改产品或 framework 实现。

## 已通过

- Node 启动/包管理器/Python test entry helpers：官方 `pnpm test:ts` 前置 16 项通过；Project Control contract guard 通过。官方 JS 测试仍在 runtime-react 的 3 项已复现失败处停止。
- `pnpm check:dependency-pins`；16 个目标包的 lockfile resolutions 均为指定版本，包含传递依赖。
- `pnpm install --frozen-lockfile --strict-peer-dependencies`。
- assistant-ui upstream、AG-UI compatibility、LangGraph compatibility、AG-UI lockfile guards。
- 核心生产包及 Creator 构建；平台 Host 的 TypeScript + Vite 生产构建。
- Creator、React、Conversation Runtime、Workbench、clean Vue Host 定向类型检查（6 个目标中仅 Web Component Vue 消费者受 bridge 分发失败阻断）。
- clean Vue Host `vue-tsc --noEmit && vite build`。
- Vue 3.5.42 / plugin-vue 6.0.1 / Vite 8.3.0：临时 SFC TypeScript fixture 在 Chromium 挂载，按钮点击后 ref 更新，未发生 pageerror；未修改产品组件。
- `pnpm verify:dev-startup`：实际启动 Host / Creator Dock / Python sidecar，验证 workspace readiness、Python proxy、Chromium 两页内容、输入控件和无 pageerror。此处在当前 workspace 执行，使用项目既有 Python .venv；不称为全新 Python 环境或 Windows 冷启动验收。
- 独立平台 Host Chromium：Composer 输入/发送、Mock AG-UI reasoning/tool/text 数据流、最终回答，无 pageerror。使用真实 HttpAgent/Conversation Runtime 与本地 Mock Agent，未调用真实模型。

## Peer 声明差异

`@vitejs/plugin-vue@6.0.1` 官方 package metadata 的 Vite peer 为 `^5.0.0 || ^6.0.0 || ^7.0.0`，不包含本仓库既有 Vite 8.3.0。初始 strict install 失败。在上述编译/浏览器验证后，沿用仓库既有精确兼容策略，新增 `@vitejs/plugin-vue@6.0.1>vite: 8.3.0` 的限定例外；不关闭全局 strict peer 检查。严格安装通过不等于上游声明支持 Vite 8，也不覆盖所有 Vue 插件功能。

## 未通过与对照

- 全仓库 build：assistant Host 的 SidebarNode 缺少 children / slotId 类型错误。相同源码恢复本轮调整前依赖后复现。
- 全仓库 typecheck：准备 Web Component declarations 时被 IIFE build 阻断。bridge 的 ES 产物可生成，但 IIFE 在 Rolldown 报 code-splitting 不支持 IIFE；旧依赖组合也复现。Vue Web Component 示例的标准 build 同样在 prebuild 阻断。
- 扩展 workspace JS 测试没有全部通过。当前包结果：runtime-core 31 passed；source-registry 31 passed；bootstrap 41 passed；runtime-react 173 passed / 3 failed；mock-agent 117 passed；React 683 passed / 17 failed；Conversation Runtime 121 passed / 7 failed / 1 expected fail；Plugins 1 passed；Web Component 7 passed；Project Control 410 passed / 184 failed。
- Creator 单独全量：264 passed / 15 failed；扩展递归轮为 265 passed / 14 failed，Mock lifecycle 用例受并发端口占用影响而不同。失败包含 setup 语言/展示预期、mock readiness、Vite routing/resource fixtures、Mock lifecycle，以及 Python sidecar integration prerequisites/fixtures；不把失败测试计为功能通过。
- 原有 Agent connection 浏览器 suite：3 项均在初始化 package preflight 阶段失败，未进入交互。因此另用现有平台 Host 验证实际输入和 AG-UI 会话。
- 调整前版本对照使用临时源码副本，恢复本轮原版本（cloud 0.2.4 / React plugin 6.1.1 / Vue plugin 6.0.9 / Vue 3.5.43 / vue-tsc 3.3.12 / Node types 20.19.43 / semver types 7.8.0 / jsdom types 30.0.0 / tailwind-merge 3.7.0）。React/core/store/tap/stream 本轮未改变。Conversation 的 7 项失败、runtime-react 的 3 项失败、React 的 16 项失败及 Creator 的 11 项 JS fixture 失败在旧组合下复现；React 的额外 Violet CSS 排序失败在单独重跑时通过，不归因为版本回归。Project Control 的旧组合对照也为 410 passed / 184 failed，失败用例标识集合与当前组合一致（旧对照另报 2 项 unhandled errors）。未逐一证明所有失败的根因。
- 本轮曾同时启动两个共享 dist 的构建，造成 ENOENT；已按串行方式重跑启动验收并通过。扩展 `pnpm -r --no-bail --if-present test` 的 Host pretest 也会并发重建共享 dist，其准备失败不能用作依赖功能退化证据。

## 判断

指定版本可以支持已验证的 Creator 启动、平台 Host、Composer、AG-UI 会话和 Vue 基础编译/响应式交互。没有在这些路径中确认本次改版本引入的新功能回归；全仓库仍存在失败，不能判断全部功能正常或宣称全量验收通过。真实模型、assistant-cloud 远程账户服务、Windows 实机及公司镜像未验收。

## Subagent 专项补充

后续专项验证 34 项定向测试、16 组完成态浏览器矩阵通过，流式和交错事件归属通过；Stop 后 transcript 不可访问，虽然原生 Runtime 内容仍保留，完整 Subagent 验收尚未通过。详见 [Subagent 报告](../subagent-company-pins-20261013/REPORT.md)。
