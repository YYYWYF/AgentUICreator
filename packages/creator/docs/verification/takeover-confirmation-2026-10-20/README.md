# 只读接管计划 → 原生确认 → Host 受控事务

本轮仅修改 `packages/creator`。保留原来的只读工具策略、专用修改工具、权限、确认、planHash/stateHash 与 Operator 提交前复核。手册、技能、系统提示词、工具描述和真实任务原断言未修改；保护文件 hash 见 `protected-content-check.json`。

## 修改清单

- `domain_tools/operator_tools.py`：正式接管计划提供现有 `ask_user_question` 的问题参数和只读衔接事实。仅在成功输出完整计划后建立 Host 私有绑定；读取不是授权。
- `human_input/source_takeover.py`：复用原生问题结构及语言空间。问题绑定实际安装版本的计划 hash；Host 在展示时附上完整计划。模型可以建议提问，不能生成批准。
- `domain_state/observation_context.py`、`streaming/deepagent_v3_runner.py`：仅在 Host 内携带运行级计划绑定，不扩展模型工具或写权限。
- `server.py`：识别当前运行已观察到的计划问题，由 Host 输出正式问题和选项。恢复仍校验 thread/interrupt/checkpoint/答案；确认后销毁暂停的只读图，直接执行这一笔插件事务。重新规划、比较 hash，Operator 仍在验证和提交前复核。通用问题继续原流程，伪造 hash 无绑定。
- `human_input/plugin_source_messages.py`：补充中英对等的事务完成/拒绝结果，区分静态检查和未进行的 Runtime/浏览器验证。
- 新增 `tests/test_takeover_confirmation_bridge.py`：真实路由、原生问题、检查点与真实 Operator；仅模型响应脚本化。

## 验证

- 整组回归：**715 passed、3 strict xfailed、2 deselected**，281.92 秒，零未预期失败。原始结果 `regression.xml`。
- Creator build、typecheck、`check:i18n`、`git diff --check` 通过。路径回归另行 **27 passed**。
- 新增链路覆盖批准、拒绝、状态过期、伪造计划 hash、模型改写文案、错误线程/interrupt、非法答案、重复恢复。批准仅接管 composer；其他插件未接管。原有只读禁写与原生 takeover 流程回归保留。
- 最终定向补跑 **35 passed**，54.74 秒，见 `final-focused.xml`（覆盖最后的结果文案与计划展示断言）；Python 源码接管文案 7 个 key 中英一致。

## 同模型、同任务真实复测

使用原有 `tests/live/test_phase3_creator_tasks.py -k takeover_question`，经过真实配置模型 → 默认 Selector → 只读 Agent → 原生 SSE 问题 → 实际 Operator。任务文本、原断言不变。

| 项目 | 上轮 | 本轮最终 |
| --- | --- | --- |
| 原验收 | 失败，仅文字请求确认 | 通过，原生确认等待用户 |
| 原生问题 | 0 | 1，Host 绑定正式计划 |
| 确认前文件修改 | 0 | 0 |
| 运行错误 | 0 | 0 |
| 耗时 | 127.550 秒 | 120.433 秒 |
| Domain 模型调用 | 3 | 4 |
| Domain 输入 token | 31,897 | 48,743 |

**本轮修的是执行衔接可靠性，没有证明性能收益。** 单样本时延不构成 p50/p95，输入 token 反而增加，仍需后续语料测量。`live/` 保存最终任务、SSE 和日志；`native-question-audit.json` 确认原生框内完整计划与事后重新读取的 Operator 计划一致，Host 权限仍是 inspect_read_only、approvalGranted=false。实际模型任务未自动批准，写入后的批准/拒绝/过期验证来自隔离回归。

## 过程中发现及保留证据

- 首次原生框虽满足旧验收，但模型改写 description 导致 Host 严格逐字匹配未绑定。修为匹配已观察到的精确计划 hash，并由 Host 重新提供正式问题/选项；不信任模型的文案或同意声明。`attempt1/live/` 保留该轮。
- `attempt2/live/` 已证明实际模型问题成功绑定。最终轮进一步在确认框中包含完整正式计划，保存在 `live/`。
- 初次整组回归有 3 个新测试缺少正式工具发现步骤、1 个实际 Operator 读取超时。补正脚本模型的发现调用，未修改权限和断言；再次整组回归 715 通过。同机并行验证时的超时保留在 `attempt1/regression.xml`，未放宽超时阈值。

## 剩余问题和验收边界

- 模型正文仍偶尔提到 Host 路由复核；实际 Host 确认执行直接消费绑定事务，不需要升级只读 Agent 的路由或权限。
- 既有 3 项严格预期失败保留：未声明 Slot 的底层错误被压平；已成功重复事务仍 dispatch Operator；先前 semantic noop 标记在后续真实修改后未清除。
- 既有 2 项旧 model_factory 测试按前轮规则排除：旧 GENERAL 响应协议、缺少 project.json。没有因本轮新增排除或 xfail。
- 只做静态及 ASGI/模型/Operator 集成验证，无浏览器视觉验收或 Runtime 证据。新路径构造复用逻辑路径校验和现有跨平台 Operator；没有新增 shell/信号/路径分隔符假设，**未执行真实 Windows 验收**。
