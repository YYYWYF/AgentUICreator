# Creator 顶部刷新异常修复报告

日期：2026-10-09（Asia/Shanghai）

**产品停止条件：PASS。全量工程测试：FAIL，未宣称全仓库验收通过。**

通过正常 `pnpm dev` 在默认 5174 / 5176 启动真实 Creator Workbench 和已有 Platform Sidebar Host，点击顶部刷新，Workspace / Python Runtime 保持 `ready`，四类资源完成刷新，Creator 后续真实对话和 `/sync` 可用。无需修改 AppUIModel、删除 `.agent-ui` 或让用户手工构建。当前默认端口服务已恢复运行。

## 根因及证据

1. 初始 `http://127.0.0.1:5174/__agent-ui/creator/workspace` 返回 `broken / AGENT_UI_APP_UI_MODEL_INVALID`，`invalid_union` 的候选只有 `row / column / stack / panel / slot`，并把 `defaultActive / header / items / content` 报为非法字段。完整响应：[before-workspace.json](evidence/before-workspace.json)。
2. 失败的监听进程 PID **82498** 从 **10 月 7 日 09:25:12** 持续运行；磁盘 Runtime 已于 **10 月 9 日 10:00:45** 更新并包含 Sidebar / Header / Footer 校验。因此磁盘新代码并不等于正在运行的 Node ESM 缓存已经更新。
3. 模块路径由 Workbench Vite 配置、package exports、Host managed entry 交叉确认，均为：
   `file:///Users/yifei/Coding/AgentUICreator/packages/project-control/dist/runtime/project-control-runtime.mjs`。
   Workbench 的 `inspectCreatorProject` 来自 `@agent-ui/project-control/dev`；`.agent-ui/control/project-control.mjs` 指向同一文件。没有为 `/dev` 配置另一条解析 alias。
   [路径与进程证据](evidence/runtime-origin.txt)、[实际 Workbench 模块解析](evidence/workbench-module-resolution.log)。无法从已经更新的磁盘反推出旧进程缓存的确切历史 commit；本报告不猜测该 commit。
4. 使用历史 pre-Sidebar Schema `770a6793^` 在临时目录编译，能对**同一份真实 AppUIModel**重现相同的五分支 `invalid_union`；当前编译 Runtime 对同一模型返回 `ready`：[old-validator-reproduction.json](evidence/old-validator-reproduction.json)。临时旧校验器仅用于测试，执行结束删除，不进入生产或项目代码。
5. 另一个确定缺陷：原准备脚本仅凭 `AGENT_UI_HOST_PACKAGES_PREPARED=1` / `AGENT_UI_WORKBENCH_PREPARED=1` 跳过构建。合法入口只能证明 URL 正确，不能证明 Runtime 最新。
6. 初次使用相对 Host 路径的独立诊断还产生 TypeScript 项目路径错误；改用与 WorkspaceManager 一致的绝对路径后消失。补齐正常包准备后官方 Composer 包也可解析。最终绝对路径证据见 [schema-source-compiled.log](evidence/schema-source-compiled.log)。这些早期诊断不作为 Sidebar 根因。

**真实主因是旧 Node 进程缓存的 Project Control 校验器；遗留准备标记是可导致旧编译产物继续运行的另一处构建一致性缺陷。没有修改 Zod Schema。**

## 修复文件与必要性

| 文件 | 修改与目的 |
| --- | --- |
| `scripts/preparation-state.mjs` | 为已有准备机制生成内容指纹，覆盖包源码、构建脚本、资源、产物和 lockfile；只允许父进程完成构建后产生且仍匹配的准备标记被子进程复用。 |
| `scripts/prepare-host-packages.mjs`、`scripts/prepare-workbench.mjs` | 不再信任字符串 `1`；准备完成后更新指纹。源码变化、产物变化/删除和遗留标记均不能跳过。 |
| `scripts/dev-workbench.mjs` | 传递真实准备结果，不再覆盖成无条件的 `1`；继续在 Vite / Creator 服务加载前使用原准备顺序。 |
| `packages/project-control/scripts/build.mjs` | 同一次 esbuild 输出内嵌 build ID 与构建输入哈希清单；这是工具构建身份，不是 AppUIModel schemaVersion 或协议版本。 |
| `packages/project-control/src/runtime-integrity.mjs`、`.d.mts` | 在项目检查前识别源码/编译输入漂移、编译产物替换后的旧进程缓存、缺失构建清单；报告 `CREATOR_PROJECT_CONTROL_RESTART_REQUIRED`。不在 HTTP 请求中构建或覆盖包。 |
| `packages/project-control/src/project/creator-project-inspector.ts`、`src/handler.ts` | 在读取和校验用户模型、执行控制操作之前检查工具一致性，防止工具异常被误归因于模型或继续做 mutation。 |
| `packages/creator/src/workspace/CreatorWorkspaceManager.ts` | 保留工具错误码；已有 ready 项目遇到过期工具时保持项目状态，并将 Runtime 标为 unavailable。未初始化项目不会擅自安装控制平面。 |
| `packages/creator/src/ui/CreatorWorkbench.tsx` | Workspace 非 ready 或 Runtime 不可用时停止依赖请求；保留原并发防护、四资源逐项失败来源与真实成功判断。配置错误普通展示简短建议，完整 issue message / Zod Issues 在技术详情中展示。工具错误使用服务不可用标题和重启建议。 |
| `packages/creator/src/ui/i18n/en-US.ts`、`zh-CN.ts` | 新增提示通过现有 Creator locale namespace，双语 parity。 |
| `apps/creator-workbench/vite.config.ts` | 显式 await 官方资源安装器，适配其返回 receipt 与 Host 回调 `Promise<void>` 的现有签名，消除真实 Workbench typecheck 错误。 |
| Creator / Project Control 测试、`scripts/preparation-state.test.mjs` | 覆盖准备标记、旧缓存识别、状态机、无初始化安装、broken 时停止资源请求、单资源失败、重复点击、草稿和会话保留。 |
| `packages/project-control/tests/migrated/creator-project-inspector.test.ts` | 修正非法模型测试缺失 project.json 且 sourceRoot 路径不匹配的夹具；保留未初始化项目检查与真正非法模型拒绝。 |
| `apps/creator-workbench/playwright.refresh.config.ts`、两份 refresh spec | 真实主 Workbench + Host 顶部刷新 E2E 和刷新后真实模型对话；不使用 Workspace、资源或模型 mock。 |
| `scripts/verify-refresh-schema.mts`、Project Control 的 reproduction/test 脚本 | 可重跑的源码/编译 Schema、历史旧校验器与缓存替换验证，全部隔离测试数据。 |

工作区原有 Creator header/CSS、React adapter 等未提交改动保留。本轮未修改 assistant-ui vendor、AG-UI 协议、登录插件或 Conversation Runtime，也没有修改 Schema / strictObject 或添加字段兼容分支。

项目检查仍先决定是否初始化及配置是否合法，再确保 managed control entry。提前安装控制入口不能更新 Node 内的校验器，因此没有用重排安装来掩盖真实问题；工具一致性检查放在 inspector 内、模型校验之前。

## 真实顶部刷新结果

最终执行：

```sh
pnpm dev
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.refresh.config.ts
```

默认端口已有项目，原始真实模型为 Sidebar，含 Agent identity Header、Conversation Thread List 和普通主内容。当前真实模型未配置 Footer；在隔离的 Host 副本中添加合法空 Footer Slot 验证，不修改用户模型。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 正常启动准备 | PASS | [pnpm-dev-default-final.log](evidence/pnpm-dev-default-final.log)：Project Control / Creator 构建先于 Vite 和 Python 启动。 |
| 遗留 `PREPARED=1` 的正常启动 | PASS | [pnpm-dev-default.log](evidence/pnpm-dev-default.log)、[pnpm-dev.log](evidence/pnpm-dev.log)：仍完成准备，不跳过旧产物。 |
| 源码 / 编译 Runtime 校验真实 Sidebar | PASS | [schema-source-compiled.log](evidence/schema-source-compiled.log)：两者 ready，隔离 Header+Footer 变体 ready；非法 defaultActive 两者拒绝。 |
| 顶部刷新连续两次 | PASS | [refresh-playwright-final.log](evidence/refresh-playwright-final.log)：主 Workbench 显示真实 Sidebar Host，Workspace / Runtime 都保持 ready。 |
| Agent 连接设置 | PASS | 两轮 `/__agent-ui/creator/connection` 都为 HTTP 200。 |
| Mock 文件及服务状态 | PASS | 两轮 `/__agent-ui/creator/mock` 都为 HTTP 200，保留原服务 stopped 状态并读取 recordings / scenarios。刷新不会擅自启动服务。 |
| 示例资源兼容性 | PASS | 两轮 `/__agent-ui/creator/mock/compatibility` 都为 HTTP 200 / checked；未安装的可选资源作为正常检查结果列出。 |
| 插件更新 | PASS | 两轮 `/__creator/updates/check` 都为 HTTP 200，返回插件及 fingerprint。 |
| 刷新后真实 Creator 对话 | PASS | 真正调用 `inspect_app_ui_model`，返回根布局 Sidebar，RUN_FINISHED，无 RUN_ERROR。[dialogue-events.sse](evidence/dialogue-events.sse) |
| `/sync` 独立回归 | PASS | [sync-response.json](evidence/sync-response.json)：changed=false，验证 passed，exitCode=0。此结果未用来替代顶部刷新验收。 |
| 浏览器未处理异常 | PASS | [browser-errors.json](evidence/browser-errors.json)：空数组；对话测试同样断言 pageerror 为空。 |
| 草稿、配置与源码无损 | PASS | 210 个 Host 文件启动前后全部同哈希；刷新前后 AppUIModel、源码、Source Lock 全部同哈希。 |

完整每项响应：[refresh-responses.json](evidence/refresh-responses.json)，简表：[resource-refresh-summary.json](evidence/resource-refresh-summary.json)。

截图：[真实 Host + Creator 刷新完成](evidence/after-refresh.png)、[刷新后真实对话](evidence/after-refresh-dialogue.png)、[最初异常截图](evidence/before-refresh.png)。

AppUIModel SHA-256：`0ecde20aab78824e599225e95385800f3403a7c51a9e7614b7824bbbf4000cbc`。
[启动前后哈希比对](evidence/startup-hash-comparison.json)、[刷新前后逐文件哈希](evidence/refresh-hashes.json)。没有清空任何用户缓存、会话或 Source Lock。

## 工程验收矩阵

| 检查 | 状态 | 结果 / 日志 |
| --- | --- | --- |
| Project Control typecheck / build | PASS | [typecheck](evidence/project-control-typecheck.log)、标准启动 build 日志。 |
| Creator typecheck / build | PASS | [typecheck](evidence/creator-typecheck.log)、标准启动 build 日志。 |
| Workbench typecheck | PASS | [workbench-typecheck.log](evidence/workbench-typecheck.log)。 |
| 新 Playwright 配置及测试 typecheck | PASS | [refresh-tests-typecheck.log](evidence/refresh-tests-typecheck.log)。 |
| Contract、Sidebar、项目检查、缓存保护 | PASS | 62 tests / 6 files：[app-ui-contract-tests.log](evidence/app-ui-contract-tests.log)。 |
| Creator 刷新、Workspace、启动准备 | PASS | 28 tests / 3 files：[focused-creator-tests.log](evidence/focused-creator-tests.log)。 |
| Source Registry 全量 tests | PASS | 31 tests / 10 files：[source-registry-tests.log](evidence/source-registry-tests.log)。 |
| Host verify | PASS | [host-verify.log](evidence/host-verify.log)：status passed，errors=[]，2 个已有 authoring placement warning。 |
| i18n | PASS | [i18n.log](evidence/i18n.log)：failures=[]。 |
| 真实 Workbench Playwright | PASS | 2 tests：[refresh-playwright-final.log](evidence/refresh-playwright-final.log)。 |
| Creator 全量 tests | FAIL | 最近全量运行 264 passed / 12 failed，6 failing files：[creator-tests-final.log](evidence/creator-tests-final.log)。 |
| Project Control 全量 tests | FAIL | 最近全量运行 405 passed / 182 failed，25 failing files，2 unhandled errors：[project-control-tests-final.log](evidence/project-control-tests-final.log)。 |
| 全仓库 release / 全插件视觉矩阵 | NOT_RUN | 超出顶部刷新修复验收；不以本轮结果宣称通过。 |

全量失败仍需独立处理。Creator 的失败包括 Setup 夹具寻找旧英文模式按钮、Mock 分组断言、`/test` / `/private/tmp/...` 不存在、资源兼容性旧断言。Project Control 多项旧夹具没有当前 project.json/sourceRoot，报 `Invalid Agent UI project configuration`，另有初始化、源事务及旧文件结构断言失败。完整失败名称在 [Creator 清单](evidence/creator-tests-final.log.failures.txt)、[Project Control 清单](evidence/project-control-tests-final.log.failures.txt)。未逐项基线隔离，因此不把每一项笼统断言为“全部既有问题”。

早期运行暴露了本轮新增 integrity helper 在 jsdom 源码测试中提前解析 import.meta.url 的问题，已改为只有编译 Runtime 存在 build ID 时才解析 Node 文件路径；直接源码仍执行正常 Schema 校验。已重跑全量测试及 62 项相关测试。另修正了本轮 E2E 的冷启动等待、`/sync` no-change 文案与对话响应路径（正式路径是 `/__creator/run`）。这些中间失败日志保留用于审计，最终产品结果以 `refresh-playwright-final.log` 为准。

**本轮只对上述已验证的刷新产品场景签收，未签收全量工程测试。**
