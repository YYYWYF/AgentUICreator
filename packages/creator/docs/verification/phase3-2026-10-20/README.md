# Creator Host 字段反馈与 observation / 工具展开修复

本轮改动限制在 `packages/creator`。保留进入本轮时已有的未提交修改；没有新增跨包修改，没有修改手册、技能或系统提示词。运行实现改动涉及 protocol guard、domain agent/tool discovery、Host operator tools 和 observation context。

## 修改与约束

- JSON Schema 校验保留原始 `errorPath`、`branchErrors`，新增有界 `fieldErrors`。对于 discriminated union，只投影与当前 operation type 唯一匹配的分支，返回完整字段路径、收到的 JSON 类型和期望类型 / schema 数值约束，不反馈被拒绝的字段值或原始异常全文。
- 将字段事实接入原有的一次协议修复反馈，不改修复提示词、不自动把 `"960px"` 转成 `960`，也不增加修复预算。叶子诊断最多 8 项、递归深度 12，修复字段 JSON 最多 512 字符，按完整条目裁减，保持有效 JSON。
- 在初始工具中提供精确的 `inspect_app_ui_model`（核心工具上限由 12 增至 13）。默认宽泛 `inspect_ui_project` 的语义与分页协议保持原样。
- 检查工具只有返回 `ok:true` 才展开 Composition 导航；不完整分页可以继续发现检查工具，但 `mutate_app_ui_model` 的可见性依赖当前 Host 的有效 observation / revision，并遵守 Recovery 前置条件。checkpoint 消息中的 hash 不能恢复当前写入依据。
- 分页结果与工具展开回执复用同一 Host readiness 投影；明确 deferredTools、原因和 requiredInspection。首次真实移动任务暴露了仅隐藏工具会导致反复 enable 的死胡同，因此保留失败证据并补齐这个反馈路径。工具描述与 schema 复用原对象，没有改提示词。
- 修改工具仍执行原有授权、ownership、显式确认、当前 observation 和磁盘 hash 门禁。外部修改导致的 hash conflict 仍在执行时拒绝；没有扩大文件写权限。没有 discovery 的强制确认 / Recovery 窄通道保持原样，现有只读与 static_only 策略继续先行生效。

典型字段反馈：`path=["operations",0,"set","maxWidth"]`、`receivedType=string`、`expectedType=number`。典型不完整 observation 回执：`ready=false`、`reason=APP_UI_MODEL_OBSERVATION_REQUIRED`、`requiredInspection={tool:"inspect_app_ui_model",arguments:{}}`；Recovery 场景指向其对应的现有检查入口。它们是当前 Host 状态数据，不是新增授权。

## 回归结果

最终聚合命令从 `packages/creator/python` 执行：

```text
.venv/bin/python -m pytest tests/test_tool_protocol_guard.py tests/test_progressive_tools.py tests/test_domain_tools.py tests/test_domain_observation_context.py tests/test_source_grounding.py tests/test_grounding_convergence.py tests/test_domain_tool_policy.py tests/test_app_ui_model_recovery.py tests/test_phase3_authoring_contract.py tests/test_plugin_source_takeover.py tests/test_completion_runtime_refresh.py -q --tb=short -rx
```

**488 passed, 3 xfailed in 44.49s**。完整结果见 `focused-regression.xml`。另有 8 项 props 透传验收断言测试通过，验证任意 rest 绑定名称、根 props 与 style 的保留，以及丢失透传时必须失败。其中包括真实 Operator 初始化消费项目、AppUIModel mutation、正式接管计划确认 / 拒绝、目标工程 typecheck / build 和静态 / Runtime 证据边界。

新增检查覆盖：数字类型叶子反馈进入实际 repair request 并在一次修复后通过；不泄露被拒绝值；嵌套 union 分支选择；反馈上限与 JSON 完整性；失败检查不展开工具；回放 / 部分 observation 不开放 mutation；revision 变化、hash 失效和恢复后重读；Recovery 与只读通道；真实 Host 分页过程中工具可见性与原有调用门禁一致。

原 `maxWidth` union 反馈测试现已通过，删除其 strict xfail。其余 3 个 strict xfail 如实保留：

1. 未声明 Slot 的 compiler issue 被 Operator 抹平成通用失败（需跨包处理）。
2. 重复成功事务第二次是磁盘 no-op，但仍发生第二次 Operator dispatch。
3. 旧 semantic no-op 标记未随后续真实修改清除，可能把完成类型误报为 already_satisfied。

扩大测试另发现 **79 项旧失败**。为区别新增回归，复制当前 Python 包到临时目录，仅移除本轮三个实现文件的改动（protocol guard 在本轮前与 HEAD 相同，其余此前未提交修改保留），附带相同 contract / skill resources，运行相同旧测试。对照结果：

- `test_domain_write_grounding.py`：前后均 3 passed / 20 failed。
- `test_path_policy.py`、`test_app_ui_model_mutation.py`、`test_inspect_resume_permissions.py`：前后均 7 passed / 59 failed。
- 所有测试状态逐项一致，无新增失败。主要为 fixture 缺少 `.agent-ui/project.json`、旧读前编辑预期及旧服务 fixture，不在本轮自由重构。

机器比较见 `legacy-comparison.json`，原始结果为 `grounding-before.xml`、`grounding-after.xml`、`legacy-host-before.xml` 、`host-regression.xml` 和最终版本的 `legacy-final.xml`（89 项测试，79 项失败，逐项状态仍完全一致）。不能把“无新增失败”描述为全仓测试通过。

Creator build 与 typecheck 均通过。构建保留现有 pnpm 配置弃用和大 chunk 提示。已核对本轮前保存的 14 个系统提示词 / skill 文件 hash，全部未变化；协议修复提示词常量同样未变。

本轮实现为纯 Python 校验事实和工具投影，未引入 shell、路径或平台信号假设。测试准备器使用现有 Node 原生 path / junction / argv 边界。尚未在真实 Windows 环境运行，不能宣称 Windows 验收通过。

## 相同六项真实任务对比

沿用 2026-10-19 的任务文本、模型与设置：mimo-v2.6-flash，temperature 0.2，maxTokens 8192，单请求 timeout 120 秒，maxRetries 2。每项任务使用同一初始化方式的独立 platform 消费工程，通过真实 Creator ASGI `/creator` SSE、实际外部模型和实际 Operator 执行。没有伪造模型、放宽权限或自动批准接管。

报告目录通过 `CREATOR_PHASE3_REPORT_DIR` 指向本目录 `live/`，保留上次原始证据。每项记录包含 response、错误、确认问题、文件路径和前后 hash、完整 SSE、脱敏运行日志及 patch。

统计口径：领域输入 token 是各领域模型轮次累计值；路由指标单列，不是单轮上下文大小或账单 token。耗时不含独立项目初始化。六项各运行一次，受外部服务与模型采样波动影响，观察到的 p50/p95 不代表稳定性能结论。

任务当前以 static_only 验证，没有采集 Runtime 或浏览器视觉证据。人工复核回答质量与自动文件状态检查分开记录；“passed”不能代替完整产品验收。

## 最终逐项结果

最终统一版本完整跑完：pytest **4 passed / 2 failed，711.80 秒**。两项失败中，`public_props` 是验收断言未覆盖合法的 `props.rootProps` 直接透传，不是实现失败；`takeover_question` 是真实的路由失败。

圆角项的原始 `passed:false` 保留，没有改写 SSE / 日志 / 原始 JSON。修正断言后，在原消费项目的同一个文件 hash 上复核，确认 props、rootProps 与 style 透传、12px 圆角、仅应用层文件变化、无源码接管及既有静态验证成功。没有新模型运行或新项目修改，见 `public-props-recheck.json`。断言自身 8 项正反例通过，见 `acceptance-assertions.xml`。按实际状态和这次固定产物复核，最终 **5/6 项完成，1 项真实失败**；这不代表完成元数据和所有产品质量问题都已解决。

| 任务 | 上次 → 本次结果 | 耗时秒（前 → 后） | 领域调用（前 → 后） | 累计领域输入 token（前 → 后） |
| --- | --- | ---: | ---: | ---: |
| 插件公开 API 问答 | 自动通过 → 通过；本次人工知识复核通过 | 69.101 → 98.193 | 3 → 3 | 28,984 → 30,398 |
| 隐藏语音按钮 | 通过 → 通过 | 154.798 → 70.504 | 6 → 5 | 161,676 → 125,591 |
| 移动回复动作 | 最终顺序通过 → 最终顺序通过；旧 no-op 完成标记仍存在 | 326.482 → 203.365 | 12 → 11 | 552,904 → 384,342 |
| 布局 maxWidth | 类型修复失败 → 修改及静态验证成功 | 47.502 → 226.872 | 3 → 9 | 65,667 → 277,228 |
| 薄应用层 rootProps 圆角 | 通过 → 原断言误报，固定产物复核通过 | 112.481 → 90.601 | 11 → 8 | 128,276 → 80,154 |
| 源码接管计划确认 | 通过 → 路由失败，未进入领域 Agent，无写入 | 80.840 → 15.508 | 4 → 0 | 61,641 → 0 |

本轮六项 candidateCount 仍全部为 0。隐藏和移动均没有再触发 `APP_UI_MODEL_OBSERVATION_REQUIRED`（上次各 1 次）；移动仍因 child Slot 的既有 index / relative 能力差异发生一次 operation_precondition 和语义重规划。本轮移动文件正确，但 completion 仍为 `already_satisfied`，不能算完成元数据验收通过。

布局项真实记录了 `operations[0].set.maxWidth: string → expected number`，一次协议修复成功；其中修复模型调用约 117 秒，没有传输失败或重试。布局上次是提前失败，这次是完整成功，二者成本不是相同工作量，不能简单把增加的调用和 token 归结为性能退化。

接管计划项在初始 Selector 耗尽输出预算时终止：`ACTION_SELECTION_FAILED`。领域调用为 0、没有写入、没有接管确认计划。不能把提前失败的低耗时和零领域 token 算为优化收益。首轮还出现过只读路由复核失败，需要后续单独修 Host 路由预算 / 复核可靠性；本轮没有为了通过测试扩大路由权限或修改提示词。

共同完成的四项（问答、隐藏、移动、圆角）合计领域调用 **32 → 27**、输入 token **871,840 → 620,485（-28.83%）**，请求耗时 **662.862 → 462.663 秒**。这只是单次诊断观察：问答上次还有人工知识错误，本次首项与首轮最后一项曾短暂重叠，外部模型延迟也有显著波动，不能宣称稳定性能提升。

全六项观察到的 p50 为 **96.661 → 94.397 秒**，nearest-rank p95 为 **326.482 → 226.872 秒**。前后真实失败的任务不同，六个异质任务各一次，不构成受控性能基准。总体耗时 / token 降幅不能作为等量成功工作的收益证明。完整路由、工具数、schema 字符数、修复、observation 和错误分类见 `summary.json`。

## 首轮与待办

`attempt-1/` 保存初始修复版本的全部六项证据（原 pytest 3 passed / 3 failed，730.65 秒）。首次移动失败暴露了“隐藏修改工具却未解释缺少前置观察”的循环，随后新增当前 readiness / requiredInspection 反馈，最终移动成功。首次圆角项是 rest 变量名引发的断言误报，首次接管项是真实路由复核失败。原始记录均保留。

下一步应优先修复 **Selector 输出预算耗尽及路由复核失败**，再处理 child Slot 移动语义、no-op 状态清理、重复成功请求去重及跨包 Slot 编译错误保真。手册和提示词仍未修改。`protected-content-check.json` 记录 14 个文件 hash 和协议修复提示词常量核对，`implementation-hashes.json` 确认最终五个实现文件与构建分发一致。

全部测试使用 static_only。Runtime / 浏览器视觉 / 真实 Windows 验收尚未执行。
