# Windows 全功能验证报告

报告建立日期：2026-10-21
平台：Windows（PowerShell）
工作区：`C:\AgentUICreator`

## 修复后复验结论（2026-10-22）

针对原报告中可归因于实现或 Windows 工具链的问题完成了修复。打包构建、Creator sidecar、Workbench 类型检查、Workbench 安装验证和 i18n 检查均通过；**全功能 Windows 验收仍未通过**，因为 sandbox Host 仍处于未初始化状态，恢复操作被自动执行策略拒绝，浏览器 E2E 与该 Host 的 UI 验证没有完成。

原报告中的失败统计是 2026-10-21 的修复前基线。按用户要求，本次没有重跑或继续排查完整测试案例套件。

### 本次修复

- Creator Python 缓存目录使用更短的 Windows 安全键和临时 venv 名称，同时在身份标记中保留完整 requirements SHA-256，避免 Windows 默认长路径限制阻断依赖安装。
- Creator sidecar 关闭时等待 Node `close` 事件，确保子进程 stdio 句柄释放后才清理临时目录。
- Operator 对生成的 Plugin registry 入口按 LF 规范化后比较，避免 Windows CRLF 被误判为陈旧文件；初始化失败回滚现在会追踪并清除本次新建的 Plugin 应用文件。
- Workbench 类型检查限定到 Plugins 的正式公开入口，并映射 `host-preview/vite` 源入口；包验证器从公开包清单读取当前包身份，不再固定断言 9 个包。
- Web Component shell 脚本改用原生 `path` API 构造文件路径；生成资源的 `searchTools` 类型和中英文 locale 补齐 5 个 context 文案字段。

### 修复后检查

| 检查 | 结果 |
| --- | --- |
| `pnpm build:package` | **通过**：七个公开包构建完成，Web Component shell 生成、类型检查与 bundle 完成。Creator dock bundle 仍有约 820 KB 的非阻塞体积提示。 |
| `pnpm test:creator-package-runtime` | **通过**：打包后的 Python 环境安装成功，sidecar 连续两次启动并通过 health 检查，重启后临时目录清理成功。 |
| `pnpm --filter '@za38.03/agent-ui-creator-workbench' typecheck` | **通过**。 |
| `pnpm verify:creator-workbench -- --skip-build` | **通过**：7 个公开 npm 包、隔离安装、GUI 资源和 CLI API 检查完成。 |
| `pnpm verify:creator-package` | **通过**：tarball 结构、契约一致性、Operator validator 和打包 sidecar health 检查完成，临时目录清理成功。 |
| `pnpm --filter '@za38.03/agent-ui-plugins' typecheck` | **通过**。 |
| `pnpm check:i18n` | **通过**：en-US / zh-CN parity 无失败，generated locale 436 keys。 |
| `pnpm --filter '@za38.03/agent-ui-operator' build` | **通过**；之后完整 `build:package` 也通过。 |
| `git diff --check` | **通过**；Git 对六个 package.json 输出换行符提示，但没有对应内容 diff。 |
| Assistant Host UI 验证 | **通过**：Host 初始化后运行 `verify-ui.ts`，状态 passed、无错误；`tsc --noEmit` 和 Vite production build 均通过。 |
| Embedded Host UI 验证 | **通过**：Host 初始化后运行 `verify-ui.ts`，状态 passed、无错误；`tsc --noEmit` 和 Vite production build 均通过。 |

### 仍未完成

- `examples/creator-host-sandbox` 的只读检查状态为 `uninitialized`。`src/agent-ui` 中恰有三份文件，SHA-256 与干净初始化生成结果逐一相同；`.agent-ui` 下的 Creator 日志和 mock 回放保持原样。
- 为恢复 Host，需要备份后移除这三份已确认的生成文件及空目录，再重新初始化。执行该文件移除操作时，自动执行策略拒绝了命令；命令未运行，本次没有修改 sandbox 文件，也没有尝试绕过拒绝。因此 `verify:ui`、根 `pnpm build` 和浏览器 E2E 仍未复验通过。
- Assistant 和 Embedded 的 UI 验证分别有 5 个 Plugin Add/Restore 位置不可用警告，因为当前配置没有为这些 Plugin 声明确定的 `defaultPlacement`；未擅自更改布局配置。两次 Vite 构建还提示 config-loader 后续兼容性和约 805–807 KB chunk 体积，均未阻断构建。
- 没有可用的模型提供方配置，未运行真实模型请求。完整包构建中的 Creator bundle 约 820 KB 体积提示仍在。
- 三个 Host 的 `.env.development.local` 均为本地 mock 服务配置，已通过 `.gitignore` 排除，不纳入提交。

---

## 修复前结论（2026-10-21）

**验证未通过，当前不能视为 Windows 全功能验收通过。** 验证发现 Python sidecar 的 Windows 虚拟环境初始化在默认深层缓存路径失败；仓库 Python、Creator、Plugins、Runtime、Operator 测试均有失败；Web Component 构建、全量构建和浏览器 E2E 被现存契约/样例配置问题阻断。以下记录是实际运行结果，不把被阻断或中断的检查算作通过。

修复前基线阶段仅进行验证与报告，没有修改产品源码。由于工作区没有 Creator 模型提供方配置，未执行真实模型请求。浏览器 E2E 在启动 Host 前失败，未进入页面交互阶段。

## 环境

| 项目 | 版本/状态 |
| --- | --- |
| OS / Shell | Windows / PowerShell |
| Node.js | `v23.11.1` |
| pnpm | `8.12.0` |
| Python | `3.12.10` |
| Playwright | `1.63.0`，Chromium 已安装 |
| Creator 模型配置 | 未发现 `.env.creator.local` 或相关提供方环境变量 |

## 修复前检查结果

| 范围 | 命令/检查 | 结果 |
| --- | --- | --- |
| Python 全套 | `pnpm test` | **失败**：pytest 收集在 `packages/creator/python/tests/live/test_vue_integration.py:48` 遇到 `IndentationError: unexpected indent`，未开始完整套件。 |
| Python 其余用例 | 直接 pytest，排除上述文件 | **失败**：`387 failed, 1408 passed, 94 skipped, 54 errors`。大量错误是测试直接启动 `pnpm` shim 时的 `WinError 2`；另有项目 fixture 配置缺失等失败。此结果用于诊断，不替代官方入口。 |
| TS 根测试 | `pnpm test:ts` | 根脚本 16 项、Core 31 项通过；Renderer 遇到创建 workspace fixture 符号链接的 `EPERM`，递归执行在此中止，后续包未覆盖。 |
| Plugins | `pnpm --filter '@za38.03/agent-ui-plugins' test` | **失败**：90 个测试文件失败、50 个通过；30 项失败、381 项通过。失败包含 Windows 符号链接权限、契约预期与当前资源/本地化数据不一致等。 |
| Runtime | `pnpm --filter '@za38.03/agent-ui-runtime' test` | **失败**：19 个文件通过、2 个失败；137 项通过、2 项预期失败。实际失败涉及 `package.json` exports 预期和 `agent.use` 不存在。 |
| Operator | `pnpm --filter '@za38.03/agent-ui-operator' test` | **中断，未得最终汇总**：长时间运行约 15 分钟后停止。停止前多个套件已有失败，包括 Creator action catalog、UI Operator、AppUI transaction、verify-ui、source-project mutation、recovery、package-upgrade、plugin-purge 等；不能据此给出全包统计。 |
| Creator | `pnpm --filter '@za38.03/agent-ui-creator' test` | **失败**：17 个文件失败、56 个通过；25 项失败、424 项通过、1 项跳过。包含 mock 数据/本地化预期不一致、fixture 数量过期、Windows 路径预期、符号链接 `EPERM`、未知资源 ID 和 sidecar 集成失败等。 |
| Web Component | `pnpm --filter '@za38.03/agent-ui-web-component' test` | **未进入测试**：`src/config.ts` 无法解析构建生成的 `.generated/.../locale-config`。 |
| Workbench preview 类型 | `pnpm --filter '@za38.03/agent-ui-creator-workbench' typecheck:preview-tests` | **通过**。 |
| Plugins 类型 | `pnpm --filter '@za38.03/agent-ui-plugins' typecheck` | **失败**：`locale-types.ts` 的 `searchTools` 消息类型缺少 5 个字段。 |
| Workbench 类型 | `pnpm --filter '@za38.03/agent-ui-creator-workbench' typecheck` | **失败**：约 610 个 TypeScript 模块解析错误，涉及 Plugin locale、UI 和生成的 vendor 路径。 |
| 根类型检查 | `pnpm typecheck` | **失败**：Web Component `prepare:shell` 的静态检查拒绝 `src/agent-ui/plugins/index.ts`，要求其只重导出生成的 capability catalog。 |
| 包构建 | `pnpm build:package` | **失败**：多个包完成构建后，Web Component 的同一 `prepare:shell` 契约检查失败。Creator 浏览器 bundle 本身生成成功，但有一个约 820 KB chunk 超过 500 KB 提示阈值。 |
| 全量构建 | `pnpm build` | **失败**：在 `examples/creator-host-sandbox prebuild` 中报 `AGENT_UI_SOURCE_ROOT_NOT_EMPTY`。 |
| 浏览器 E2E | `pnpm --filter workbench test:e2e` | **失败于启动阶段**：依赖安装恢复后，Host prepare 因 sandbox Source Root 非空退出；Playwright 页面用例未启动。 |
| UI 验证 | `pnpm verify:ui` | **失败**：读取 sandbox `.agent-ui/project.json` 时配置无效。 |
| Creator 包验证 | `pnpm verify:creator-package` | tarball 结构、契约一致性和 Python sidecar health 均通过；整体命令在清理阶段以 Windows `EBUSY` 退出，临时目录仍残留。 |
| Creator Workbench 包验证 | `pnpm verify:creator-workbench -- --skip-build` | **失败**：验证脚本断言包数为 9，实际为 7（`7 !== 9`）；后续 consumer 检查未执行。 |
| Python wheel | `pnpm verify:creator-python-wheel` | **通过**：wheel 构建、隔离安装、契约一致性及 validator 导入检查通过。 |
| 打包 sidecar 启动 | `pnpm test:creator-package-runtime` | **失败**：两次干净打包 sidecar 初始化均在 Windows `venv` 的 `ensurepip` 阶段报 `CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED`。复现表明默认 `%LOCALAPPDATA%` 深层缓存路径也失败，浅路径 venv 则成功，指向 Windows 路径深度/长度相关问题。 |
| i18n | `pnpm check:i18n` | **通过**：en-US / zh-CN parity 检查通过（Creator 831、presentation 385、generated 431 keys）；copy candidates 221，failures 0。 |
| Operator 契约 | `pnpm check:operator-contract` | **通过**。 |
| assistant-ui / AG-UI 兼容 | `pnpm check:assistant-ui-agui-compat` | **通过**：AG-UI client 解析版本与要求兼容。 |
| assistant-ui / LangGraph 兼容 | `pnpm check:assistant-ui-langgraph-compat` | **通过**。 |
| AG-UI lockfile | `pnpm check:assistant-ui-agui-lockfile` | **通过**：锁定版本 `0.0.59`，取消目标一致。 |
| 依赖 pin | `pnpm check:dependency-pins` | **失败**：历史 resource `item.json` 中存在非精确依赖范围，不符合当前检查器规则。 |
| React 兼容性 | `pnpm check:react-compat` | **失败**：Windows 子进程解析分别报 `C:\nvm4w\nodejs\node.exe` / `cmd.exe` `ENOENT`；直接运行脚本也失败，检查逻辑未完成。 |
| 工作区 diff | `git diff --check` | **通过**，未发现空白错误。 |

## 修复前主要阻塞项

1. **Windows sidecar 安装路径**：完整打包路径下 venv 的 `ensurepip` 失败，导致 sidecar 无法干净初始化。这是最直接的 Windows 功能阻塞。
2. **旧 sandbox fixture 阻塞端到端流程**：Host 初始化因 Source Root 非空失败；其 `.agent-ui/project.json` 也无法通过配置读取，导致全量 build、verify:ui 和 Playwright E2E 无法走到应用页面。
3. **Web Component 生成/契约不一致**：生成的 locale 文件缺失，且 Plugin registry 静态契约检查失败，阻断 package build 和根 typecheck。
4. **Windows 测试环境兼容问题**：多个用例直接启动 `pnpm`，或创建符号链接；在当前 Windows 环境分别遇到 `WinError 2` 和 `EPERM`，导致测试无法完整运行。
5. **实现/fixture 断言不一致**：Plugins、Runtime、Creator 等包存在真实断言失败，涉及 locale 文案、exports、资源清单、API 调用和 fixture 数量，需要分别核对预期与实现。
6. **检查脚本漂移/环境问题**：Workbench 包数断言与当前 7 个公共包不一致；依赖 pin 检查命中历史资源；React 兼容脚本无法启动子进程。

## 修复前残留状态与限制

- 未执行真实模型请求；模型提供方配置不可用。
- E2E 未运行到浏览器页面交互，不能据此判断 UI 交互行为。
- 修复前 `pnpm verify:creator-package` 临时目录 `C:\Users\63509\AppData\Local\Temp\agent-ui-creator-distribution-GxlHSA` 未能自动清理；修复后同一验证入口已通过并成功清理新临时目录。
- Git 状态显示六个包的 `package.json` 为 modified，但逐个内容 hash 与 HEAD 相同，`git diff` 无内容；工作区有一个 0 字节 `.git/index.lock`，因此没有尝试刷新或删除索引锁。
- 以上失败项是修复前记录。sidecar、Web Component 契约、Workbench 类型/包清单和 locale 类型问题已修复，复验见报告开头；sandbox Host 初始化仍被自动执行策略拒绝，全量测试案例按用户要求未继续排查。
