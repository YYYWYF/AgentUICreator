# 2026-11-05 接续摘要：Creator Windows 模型测试

后续本机续测、修复和新的模型对照见 [Creator 续测记录](../creator-resume-20261105/README.md)。本页保留交接时的 Windows 结果与当时未验证项，不回写原始结论。

先读本页，再看 [summary.json](summary.json)。本轮代码与测试起点是 `14162e2b`（此前三次 `test` 提交已检查）。源码修改在本摘要所在提交历史中；所有测试均运行在独立临时项目，没有修改三个维护中的示例 Host，也没有手工修补模型生成的业务实现。

实现提交：`85517048`。本交接包作为后续独立测试记录提交，包含当前结果与尚未重测的最后修复说明。

## 当前结论

任务进度面板已经能生成、组合并运行。使用 262144 上下文预算的轮次在 **8 分 54 秒自然结束**，43 次工具调用、9 个文件变化、0 次上下文压缩；约 5 分 14 秒完成插件创建，6 分 51 秒完成组合，7 分 26 秒最终静态验证通过。

该轮最初浏览器 QA 第三项超时是选择器缺陷：输出使用原生 `<details>/<summary>`，旧测试只查按钮。修正测试支持原生 disclosure 后，**完全不改模型生成源码**独立重放：typecheck/build 通过，4 项交互全通过，browserErrors=[]，sourceUnchanged=true。原始失败记录保留，没有回填为通过。见 [重放结果](records/progress-optimization-20261104/case08-progress-262k-replay/result.json)、[截图](records/progress-optimization-20261104/case08-progress-262k-replay/verified.png)。

销售报表 262144 轮的 4 项浏览器检查也全部通过：JSON 字符串表格、收入排序、行选中订单数、错误 JSON/空数据可用性。**原生执行状态仍为 blocked，不能写成全绿。** 这轮在约 17 分 56 秒结束，67 次工具调用、9 个文件变化、0 次压缩；最终静态/Runtime 回执 revision=7/7 已验证，但交付台账错误认为 application 插件未组合，引发多余调查和一次停用/启用尝试。见下方最后修复。

| 最终完整轮次 | 原生结果 | 工具调用 | 源码文件变化 | 压缩次数 / 耗时 | 浏览器结果 |
| --- | --- | ---: | ---: | --- | --- |
| 任务进度，65536 | QA 在 20 分钟正常停止 | 79 | 9 | 12 / 约 374 秒 | 原 QA 前两项通过；第三项旧选择器超时，未在此输出重放 |
| 销售报表，65536 | QA 在 20 分钟正常停止 | 128 | 8 | 12 / 约 293 秒 | 未显示表格，未完成组合 |
| 任务进度，262144 | success，533.754 秒 | 43 | 9 | 0 / 0 | 改正选择器后，对原输出 4/4 通过 |
| 销售报表，262144 | blocked，1076.49 秒 | 67 | 9 | 0 / 0 | 原轮 4/4 通过 |

两个上下文档位都使用同一原始问题、模型、16384 输出预算与 120 秒请求超时；每项 128 个 Agent UI 初始文件 hash 与旧轮一致。单次比较仍有模型与服务波动，不能宣称消除了所有根因或得出稳定提速比例。

## 已修复内容

1. Windows JSONL 日志改为受路径保护的追加写入，避免读者持有文件时逐条 rename 导致 EPERM；保留原有源码事务原子写入。含并发读写、持有句柄与越界 junction 回归。
2. 识别 HTTP 200 SSE 内的 `[400] Grammar error: Unimplemented keys: ["uniqueItems"]`，从 json_schema 降级 json_object；完整字段契约同时写进分类提示，继续严格本地校验，不放宽权限。新增失败阶段/字段类型诊断，不保存响应正文或私有推理。
3. 统一官方 locale 覆盖与项目业务消息的指引，避免要求模型扩展不存在的官方 namespace API。说明应用事件 schema 的可选项目位置，区分消息 renderer 与实时订阅，补充状态合并和取消订阅例子。
4. 归档分页重读不计新证据；持续调查给出收敛提醒，但不强制写代码、不设置累计调用/图步骤上限。保留取消、单请求超时、只读和原生确认。
5. 按预算保留已批准实施要点和有模块/版本的实际 API 观察；共享 API 查询省略无关插件清单。摘要区分要求来源，目标缩短，摘要输出默认独立预留 8192，并在压缩后留工具往返余量。
6. 插件创建返回明确的创建/注册/组合状态和验证入口，说明 `validate_creator_changes` 会先同步生成注册表，不需要寻找项目生成脚本。
7. 最后修复 application 插件交付误判：持久化 `applicationPlugins` 可只有 `{ pluginId }`，而 `p5` 是检查接口派生的身份。旧代码读持久条目的 `.id` 再与 `p5` 比较，必然不相等。现在依据检查接口返回的 `target.type === 'application'`，不迁移 Schema、不改保存格式、不依赖 DOM，也不放宽停用/删除保护。新增 4 项回归覆盖简写 application、布局目标、停用以及缺失交互证据仍阻塞。

**最后第 7 项在真实模型轮次结束后修复。** 它有最终回归/类型检查/构建记录，但尚未重新运行真实模型；不能把旧 blocked 记录改成新修复后成功。这是下一台电脑首先应复测的点。

## 验证及未解决问题

- 最终测试记录位于 [验证日志](records/progress-optimization-20261104/)。`creator-tests-handoff.log` / `typecheck-handoff.log` / `build-handoff.log` 对应最后 application 判定修复；`*-final.log` 是其前的完整优化版本。
- 最后全量 522 项：518 通过、3 失败、1 跳过。除下述两个既有失败外，`plugin-applications.test.ts` 一项在并行全量中超过默认 5 秒；保持默认阈值、单 worker 复跑该文件和新交付回归，9/9 通过（`final-focused-recheck.log`）。保留原超时记录，不称全量全绿。最终类型检查与构建通过。
- Creator 全量仍有两个本轮前已存在的 Windows 失败：`local-recording.test.ts` 创建文件 symlink 时权限 EPERM；`service-implementation-tools.test.ts` 公共声明检查的盘符大小写问题。没有删除或跳过失败来获得通过。
- i18n 检查无失败；离线文档 13 项测试及打包校验通过；公开文档提取的 3 个真实 TS/TSX 示例已编译通过。
- 原生 `verify_ui_plugin_behavior` 在本夹具报告 `PLUGIN_BEHAVIOR_INFRASTRUCTURE_UNAVAILABLE`。外部 Playwright 通过不等于原生台账已持有交互证据。下一步需要处理缺少测试设施时的准确交付/停止判断，避免模型继续无关调查或用切换插件去凑证据；不能伪造 PASS。
- 生成输出的国际化实现并不完全一致：销售采用共享项目消息模块，任务进度保留插件内双语表并读取统一 locale code。不要把“提供了指引”写成所有生成组织约定均已被强制验证。
- 独立任务进度重放的原进程 exit=1 发生在**断言全通过后的临时目录清理**（Windows EBUSY）。原始 cleanup.json 保留；若有 cleanup-retry.json，它记录随后清理重试，不修改功能断言结论。
- 本记录包含早期诊断失败与手动正常停止的尝试；只有明确标注的最终轮和重放才是最终验收。详见历史 [分析](records/schema-fix-20261104/progress-analysis.md) 和 [优化报告](records/progress-optimization-20261104/REPORT.md)。

## 换电脑开始

1. 拉取 `origin/dev`，使用仓库要求的 Node（本机实测 **22.23.4**；Node 23 不支持）和 pnpm **8.12.0**。全程从仓库根目录运行以下命令。
2. 安装锁定依赖与文档依赖：

```powershell
pnpm install --frozen-lockfile
pnpm --dir website install --frozen-lockfile
```

3. 在工具 Host 的 `.agent-ui/creator/.env.local` 配置模型。可参考 [model.env.example](model.env.example)，填入本地 API key。**凭据未推送。** 使用 `CREATOR_*` 名称，不能直接照抄最初的 `MODEL_*`。`CREATOR_MODEL_OPENCODE_SESSION_HEADER=1` 对这个服务必要。切换目标项目不切换凭据根。
4. 构建 Core、Renderer、Runtime、Plugins、Creator、Web Component 和离线文档。当前工作机完成过构建；冷启动曾遇到 Plugins 的验证需要 Runtime dist 的顺序问题，本轮未修复整个冷构建链。相关命令：

```powershell
pnpm --filter @za38.03/agent-ui-core build
pnpm --filter @za38.03/agent-ui-renderer build
pnpm --filter @za38.03/agent-ui-runtime build
pnpm --filter @za38.03/agent-ui-plugins build
node scripts/creator-documentation.mjs --generate
pnpm --filter @za38.03/agent-ui-creator build
pnpm --filter @za38.03/agent-ui-web-component build
```

如果冷构建因缺少对方 dist 中断，先保留已生成产物，构建缺少的包后重试前一项，并记录实际错误；不要把它当成 Creator 场景失败，也不要修改维护示例。上面不是“已验证所有全新机器一步成功”的承诺。

5. 准备 QA 依赖解析及 Chromium：

```powershell
node artifacts/creator-windows-20261105/scripts/setup.mjs
pnpm --filter @za38.03/agent-ui-creator-workbench exec playwright install chromium
```

setup 只在测试脚本目录建指向当前 checkout 的 node_modules junction（其他平台为目录 symlink）。不拷贝 node_modules，不需要 Python。

6. 先复查最终修复，再运行模型场景：

```powershell
pnpm --filter @za38.03/agent-ui-creator exec vitest run tests/creator-plugin-delivery.test.ts tests/evidence-progress.test.ts tests/working-context.test.ts tests/creator-context-window.test.ts tests/creator-model-config.test.ts
pnpm --filter @za38.03/agent-ui-creator typecheck
node --import ./packages/creator/node_modules/tsx/dist/loader.mjs artifacts/creator-windows-20261105/scripts/evaluate.mts case08-progress resume-262k
node --import ./packages/creator/node_modules/tsx/dist/loader.mjs artifacts/creator-windows-20261105/scripts/evaluate.mts case07-sales resume-262k
```

它们是有成本的真实模型测试。每项在独立临时项目中运行，QA 只模拟新插件“开始开发”，不批准源码接管、依赖安装或其他问题。20 分钟是 QA 观察窗口，产品执行没有累计调用上限。新输出保存在本目录被忽略的 `local-runs/`。

若只想重放本次已有任务进度输出、不调用模型：

```powershell
node --import ./packages/creator/node_modules/tsx/dist/loader.mjs artifacts/creator-windows-20261105/scripts/replay-scenario.mts case08-progress-262k
```

加 `--check` 可先检查归档路径和脚本导入，不启动模型或浏览器。

复用的是归档中的原始生成源码；重放会显式绑定受控 Agent，执行 typecheck、build、浏览器检查，并比较源码 hash。截图不替代源码或行为测试。

## 明天优先核对

1. application 交付误判修复后的真实销售轮，确认台账不再错误返回 PLUGIN_NOT_COMPOSED；保留交互设施缺失的真实状态，不绕过保护或要求模型重挂载已有插件。
2. 为原生交互验收建立实际可运行的测试入口，或改进设施缺失后的准确结束。重测任务进度与销售的自然交付，不只看首次写入。
3. 检查最终生成代码的 locale 归属、未知状态处理及语言切换状态保留；重复 262144 场景，验证不是单次随机成功。
4. 单独修复/验证两个既有 Windows 失败和全新 checkout 的构建顺序。不要把 macOS 通过写成 Windows 通过。

## 记录与保密

`records/` 保存本轮所有本地测试目录的结果、原生 JSONL/SSE、事件时间线、脱敏模型元数据、截图、生成源码和历史辅助脚本；跳过凭据、node_modules、符号链接和派生 doc-example-project。历史辅助脚本保留用于审阅，**可执行入口以 scripts/ 为准**。

原生成源码按字节保留。日志路径中的工作机/用户目录替换为占位符，已知凭据与私有提供方推理字段脱敏；[record-manifest.json](record-manifest.json) 保存原始和发布副本 SHA-256、字节数及是否变化。压缩摘要是历史工作摘要，不是私有推理。所有原生失败、超时和 blocked 结果都保留，不被外部验收结果回填。
