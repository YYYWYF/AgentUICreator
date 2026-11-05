# Creator 续测记录 · 2026-11-05

从 `f96d8f5d1` 继续，先阅读了 [Windows 交接说明](../creator-windows-20261105/README.md)，再重新构建当前代码、运行真实 Creator。问题沿用 [已批准的 7 项原始输入](../creator-complex-scenarios-20261104/questions.json)，没有加入已删除的第 2 项。

这组任务最终选定输出的 **41 项浏览器检查通过**。这不是首次成功率 7/7：帮助操作区和报表需反馈修复，检查结果经历服务中断、输出截断与工程修复。“干净初始项目”指与原任务相同的 128 文件快照，含已有帮助卡片，不是空白 Bootstrap 工程。

| 任务 | 最终浏览器覆盖 | 交付结论 |
| --- | --- | --- |
| 双卡片独立展开/收起 | 4 项 | 通过 |
| 完成/流式/停止/重新生成操作 | 5 项 | 通过 |
| 查看示例回填输入框 | 2 项 | 布局反馈修复后通过 |
| 订单消息、商品展开 | 3 基本 + 2 扩展 | 通过 |
| 检查结果、失败原因、复制 | 4 基本 + 3 扩展 | 最终干净 32K 轮通过 |
| JSON 报表、排序和订单数 | 4 基本 + 7 扩展 | 数据反馈修复后通过 |
| 多任务进度、状态合并 | 4 基本 + 3 扩展 | 通过 |

所有探索都在独立临时项目进行，维护示例未修改。模型为 `deepseek-v4.1-flash`，配置上下文 262144、保留 12000、摘要输出 8192、请求超时 120 秒、温度 0.2。默认对照输出为 16384；检查结果另做 32768 输出预算对照，不修改工具 Host 的本地配置文件。模型任务顺序执行，外部浏览器重放可以并行。QA 只模拟原生“开始开发新插件”选择，不批准源码接管、依赖升级或任意其他问题。

## 发现与处理

1. **Data Message UI 丢失交互状态，已修复产品代码。** 注册桥每次重渲染都创建新的 renderer，assistant-ui 因组件类型变化而重挂载。父组件普通更新、语言切换都会清空展开状态。修复在 [data-message-ui.tsx](../../packages/plugins/src/internal/data-message-ui.tsx)，使用稳定回调，并保留显式更换实现和卸载清理。新回归先复现失败，再通过；实际浏览器也验证了语言切换与后续消息不会清空报表状态。没有修改 vendor、提示词、Skills 或文档。
2. **帮助操作按钮被聊天区遮挡，已由 Creator 按真实反馈修复。** 原始任务能生成按钮且编译通过，但卡片固定高度没有容纳新增操作区，普通点击被聊天视口拦截。独立重放再次复现。使用 [自然语言反馈](../creator-windows-20261105/help-actions-feedback.txt) 重新运行，Creator 只修改 AppUIModel；169.445 秒、10 次工具调用。修复后普通点击填入草稿、不自动发送，用户可手动发送。
3. **报表无效数据伪装成零、空数组显示格式错误，已由 Creator 修复。** 使用 [数据反馈](../creator-windows-20261105/sales-feedback.txt)，Creator 修改插件的两个文件；102.806 秒、16 次工具调用。修复后真实零值、缺失与异常值、空报表、排序、点击行、键盘、语言切换及后续消息检查通过。原始失败输出没有手工修补或替换。
4. **误生成的 npm 元数据指错诊断文件，已修复。** 模型在自定义插件中写了官方 npm 薄应用层的 `application.json`。旧验证器指向 `manifest.json`，只报 `PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED`，模型随后反复查错文件。现在准确指出标记文件与“ID 不在已安装 catalog”事实；非法 JSON 和 ID 不一致也以结构化问题返回，不中断其他插件的发现。没有静默忽略无效文件。
5. **普通源码文件无法删除，已补齐实际工具能力。** 原工具只有创建、编辑，删除只用于内部回滚。新增 `delete_ui_source_file`，沿用写入边界和新鲜读取要求，记录真实删除与撤销/再次应用；删除应用标记也会触发注册表同步。恢复轮模型自行使用了该工具，没有手工清理生成源码。随后在临时项目复现并修复了大小写别名绕过保护：`Runtime` 不能绕过 `runtime`，`Plugins/SOURCE` 也保留实现接管检查。探针前后文件状态及回归日志在 checks。
6. **坏源码阻止 Creator 重新打开，已修复编辑启动路径。** 结构、配置、路径、AppUIModel 和 source-lock 通过检查后，源码诊断可提供 `repairContext`。Workspace Manager 显示原错误并启动 Creator 进行修复；严格项目检查仍返回 broken，Bootstrap 验收不放宽。实际重新选择原样失败项目，HTTP 状态为 ready、warnings 中保留 severity=error，并成功运行原始任务。配置或路径等结构错误不提供恢复上下文。
7. **单次输出截断仍是明确的可靠性边界。** 检查结果任务在上下文 104700 时触及 16384 单次输出，其中推理 10746；`create_ui_plugin` 参数未结束即 `finish_reason=length`，原生报 `MODEL_OUTPUT_TRUNCATED`，零写入。这不是 262144 上下文不足。另以 32768 输出预算对照；结果见下表。未实现自动拆分生成或截断恢复，未更改默认输出配置。不同轮次的生成轨迹不同，不能把随后成功全部归因于提高预算。
8. **服务异常与代码问题分开。** 订单和检查结果各有一轮因 OpenCode Go 返回续费付款授权 `403` 而中断，均零写入；之后同模型请求恢复 HTTP 200，再从相同初始源码重测。不能据此推断免费模型、限速或账单问题的全部原因。
9. **原生交互验证缺少设施，仍未解决。** 测试 Host 没有项目 Playwright 配置，原生工具真实返回 `PLUGIN_BEHAVIOR_INFRASTRUCTURE_UNAVAILABLE`。外部 Playwright 通过不替代原生交互回执，也不把 `blocked` 改成 `success`。部分模型方案只要求静态/Runtime 验证，原生 `success` 不代表原生执行过点击测试。

## 模型与工具记录

<!-- RUN_TABLE_START -->
| 任务 | 轮次 | 原生状态 | 秒 | 工具 | 输入 token | 输出 token | 原轮浏览器 |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 独立双卡片 | 原始任务 | success | 410.149 | 37 | 2,979,181 | 37,677 | [passed](records/case01-cards-mac-resume-262k-2026-11-05T00-35-28-153Z/result.json) |
| 回答操作 | 原始任务 | success | 180.239 | 23 | 1,384,297 | 11,235 | [passed](records/case03-message-actions-mac-resume-262k-2026-11-05T00-32-18-522Z/result.json) |
| 帮助操作区 | 原始任务 | blocked | 532.37 | 43 | ≥1,962,640 | ≥18,815 | [failed](records/case04-help-actions-mac-resume-262k-2026-11-05T00-45-41-027Z/result.json) |
| 订单消息 | 原始任务 | RUN_ERROR | 163.901 | 38 | ≥748,840 | ≥12,985 | [未执行](records/case05-order-mac-resume-262k-2026-11-05T00-55-18-104Z/result.json) |
| 检查结果 | 原始任务 | RUN_ERROR | 9.124 | 0 | ≥0 | ≥0 | [未执行](records/case06-inspection-mac-resume-262k-2026-11-05T00-58-14-601Z/result.json) |
| 销售报表 | 原始任务 | success | 164.784 | 30 | 1,871,582 | 15,657 | [passed](records/case07-sales-mac-application-fix-262k-2026-11-05T00-20-41-890Z/result.json) |
| 任务进度 | 原始任务 | success | 313.468 | 42 | ≥2,463,798 | ≥26,652 | [passed](records/case08-progress-mac-resume-262k-2026-11-05T00-25-10-676Z/result.json) |
| 销售报表 | 用户反馈修复 | success | 102.806 | 16 | 662,086 | 9,558 | [passed](records/case07-sales-mac-data-feedback-2026-11-05T00-43-45-591Z/result.json) |
| 帮助操作区 | 用户反馈修复 | success | 169.445 | 10 | 746,513 | 5,200 | [passed](records/case04-help-actions-mac-layout-feedback-2026-11-05T00-58-43-568Z/result.json) |
| 订单消息 | 服务恢复重测 | success | 587.839 | 54 | 3,880,140 | 25,473 | [passed](records/case05-order-mac-service-retry-2026-11-05T01-01-54-308Z/result.json) |
| 检查结果 | 服务恢复重测 | RUN_ERROR | 186.75 | 11 | ≥466,185 | ≥21,434 | [未执行](records/case06-inspection-mac-service-retry-2026-11-05T01-11-58-739Z/result.json) |
| 检查结果 | 32K 对照，诊断停止 | RUN_ERROR | 636.267 | 46 | ≥3,468,561 | ≥30,335 | [failed](records/case06-inspection-mac-output-32k-2026-11-05T01-16-53-966Z/result.json) |
| 检查结果 | 坏项目启动被拒 | HARNESS_ERROR | — | 0 | 0 | 0 | [启动失败](records/case06-inspection-mac-diagnostics-repair-original-2026-11-05T01-38-01-748Z/harness-error.json) |
| 检查结果 | 运行中恢复，QA 编排无效 | RUN_ERROR | 389.701 | 51 | ≥2,898,014 | ≥17,660 | [failed](records/case06-inspection-mac-running-repair-original-2026-11-05T01-41-44-298Z/result.json) |
| 检查结果 | 重新打开坏项目恢复 | success | 811.982 | 66 | 4,353,573 | 38,248 | [failed（选择器问题，另有重放）](records/case06-inspection-mac-fresh-recovery-original-2026-11-05T01-52-04-038Z/result.json) |
| 检查结果 | 最终同初始快照，32K | success | 410.171 | 29 | 1,549,612 | 19,863 | [passed](records/case06-inspection-mac-final-clean-32k-2026-11-05T02-08-13-472Z/result.json) |
<!-- RUN_TABLE_END -->

计时从提交原始问题到原生终态，包含原生确认的模拟选择，不含项目准备和后续外部浏览器检查。工具数来自完整事件流，包含中断前后。token 为供应商上报的累计输入/输出，包含反复传入与缓存输入；推理已包含在输出中，不能再相加。缺少 usage 的响应使总量只能作为下界。HTTP 请求数包含分类、Schema 降级，与工具数不同。

[summary.json](summary.json) 提供每种工具的次数、各次校验结果、首次成功修改、压缩统计、模型 HTTP 请求及 token 分项；完整事件、源码、截图和校验日志在 [records](records) 与 [checks](checks)。本轮不以单次对照得出稳定提速比例。销售报表不再出现旧的 `PLUGIN_NOT_COMPOSED` 误判，但模型方案的验证要求和平台也有差异，不能把全部耗时变化归因于这一项修复。

恢复轮仍花了较长时间查注册表、其他插件与脚本目录，之后才插入 application 实例。当前生成器只为已选择的 Plugin 输出运行注册条目；源码存在与已组合不同。新增诊断、删除和重新打开能力解决了具体阻塞，但没有证明模型的查询收敛和首次开发稳定性已全部解决。`rawTelemetryTotals` 包括失败、QA 无效轮和手动停止的实际资源消耗，不能当作单任务性能基准或本轮总墙钟时间。

## 验证范围

- Creator 基线完整测试：51 文件、522 项通过；最终修复后：52 文件、543 项通过。Plugins：38 文件、302 项通过，含新增 renderer 生命周期回归。Operator 诊断/严格初始化 16 项及源码接管 10 项通过。相关构建和类型检查通过。59 项预检与 Creator 全量有重叠，不重复计数。
- 浏览器通过受控 HTTP SSE 接收真实 AG-UI 事件，覆盖独立卡片、生成/停止/再生成按钮、草稿回填、订单展开、检查原因/复制、报表解析/排序、任务进度合并。扩展测试比较全部 Agent UI 源码 hash，未修改模型生成实现。
- 独立重放执行项目类型检查与 Vite 生产编译；夹具使用 workspace 链接，编译 `write:false`，不等于冷安装、真实部署、真实业务后端或完整打包验收。
- 本机 macOS / Node 24.22.1 / Chromium。未运行真实 Windows；交接文件中的既有 Windows symlink 权限、盘符大小写失败不能用本机通过覆盖。新增路径判断区分原生路径和逻辑路径，大小写别名探针在 macOS 不区分大小写的临时目录实际运行。最后大小写守卫修复后执行完整测试、构建和生成输出重放，没有再次付费模型生成；原始干净任务生成发生在该小修之前。
- 错误的首版进度英文选择器把 `Job progress` 写成了 `Task progress`；检查结果首版选择器把项目名和错误消息前缀同时匹配。原始失败保留，修正选择器后只重放未改动源码。对 403 后尚未创建功能的基线所作浏览器断言，不适用于功能验收，summary 标为 `not-applicable-feature-not-created`。
- 一轮恢复测试期间 QA 提前修改了 Operator 源码，触发版本完整性保护。该轮记录 `QA_SOURCE_CHANGED_DURING_RUN`，不作为产品失败或速度对照；之后先完成构建，再用同一失败源码重新打开。另一轮在确认根因后通过原生停止接口手动结束，`qa-stop-request.json` 留存原因，不冒充原生自然完成。
- 新增诊断测试首版夹具遗漏必需的 description，修正后通过；初始化回归的旧断言依赖双引号，现按模块/声明语义兼容格式器引号。新增二进制删除测试首版预期在删除时拒绝，实际已有读取守卫更早拒绝；校正断言后验证无法获得新鲜读取、无法删除、字节和 revision 不变，没有为此修改产品实现。失败和重新运行日志均保留。

归档不包含凭据、进程 profile 或私有推理正文；只保留推理长度/token 元数据。账户专属付款链接在副本中脱敏，原生状态、指标和源码未改，原始本地运行保留。文件完整性见 [record-manifest.json](record-manifest.json)。

可直接运行 `node artifacts/creator-resume-20261105/verify.mjs` 核对全部归档文件，不需要模型服务或额外依赖。`checks/credential-scan.json` 记录已配置模型凭据的精确匹配扫描；不将这种扫描冒充完整安全审计。

## 后续重放

沿用旧交接中的依赖安装、构建和 `scripts/setup.mjs`。可把 `AGENT_UI_QA_SOURCE_RUN` 设为本目录某个 `records/<运行目录>` 的绝对路径，再运行旧夹具的 `replay-scenario.mts` 或 `verify-extended.mts`；这两种重放不调用模型。独立重放的第一个参数仅用于输出标签，扩展测试的第一个参数须为对应 case ID。

真实模型测试仍使用旧夹具 `evaluate.mts`。它新增可选 `AGENT_UI_QA_SOURCE_RUN` 与 `AGENT_UI_QA_PROMPT_FILE`，分别记录初始源码与实际反馈输入。普通原始任务重测时清除这两个变量；不要把反馈轮冒充原始任务。`AGENT_UI_QA_SEED_AFTER_STARTUP=1` 仅用于模拟已运行 Creator 中途出现坏源码，阶段明确写进 qa-input；真正重新打开坏项目的最终轮没有使用它。`collect.mjs` 收集本机 `local-runs` 并重新计算归档清单，默认要求本组所有运行已结束，`--partial` 只用于工作中快照。
