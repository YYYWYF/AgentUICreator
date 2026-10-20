# Selector 输出预算与路由复核修复

本轮只新增 `packages/creator` 内的实现、测试和验证证据，保留此前未提交的修改。手册、skills、系统提示词及 Selector 提示词常量未改；权限、源码接管确认与 hash 门禁未改。

## 已修复

1. **输出预算耗尽的有界恢复。** 普通 Selector 请求仍使用原配置（默认及本次实际均为 512 token）。仅当响应 `finish_reason=length` 且无法解析出完整合法选择时，使用原有唯一一次恢复机会，以 `CREATOR_SELECTOR_RECOVERY_MAX_TOKENS` 配置的预算重新调用，默认 2048。恢复请求复用完全相同的提示词、原始请求与候选映射，没有语义猜测或可写兜底。正常完整输出不额外调用；`length` 下的完整合法选择仍可接受。预算恢复与语义纠错共享原有一次恢复机会，最多两次 Selector 调用，传输恢复仍遵循现有独立策略。配置恢复预算不大于普通预算可禁止预算增长。
2. **隔离 Graph 输入。** 上次真实日志的路由复核错误是 `'HumanMessage' object has no attribute 'get'`：LangGraph 将传入的消息列表原地转换为 BaseMessage，Host 随后仍按原始字典格式读取它。现在 `DomainReadAgent.run_messages` 在进入 Graph 前复制输入，原始 Host 对话、用户授权和复核依据保持不变。读写 Agent 共用这个执行边界；没有改权限解释或允许只读升级。
3. **记录实际预算恢复。** 增加 `actionSelectorRecoveryMaxTokens`、`actionSelectorOutputBudgetRetries`；`actionSelectorRequestedMaxTokens` 记录当前实际请求预算。普通初始预算和通用 Agent 输出预算未变。没有重新引入累计执行调用或 graph-step 上限。

实现文件：`model_settings.py`、`operations/selector.py`、`operations/models.py`、`operations/engine.py`、`domain_agent/agent.py`。

## 回归

最终运行 **689 passed、3 strict xfailed、2 deselected，46.02 秒**，完整结果见 `regression.xml`。

新增覆盖：空/部分输出截断恢复、恢复提示词不变、预算上限、第二次截断/格式错误不得第三次调用、语义纠错与预算恢复共用一次机会、fresh transport client 继承当前预算、恢复中取消、独立配置与禁止增长；真实 Graph 的只读执行→路由复核、原始消息不被改变、显式只读拒绝写入升级、重复复核不得无限循环，并分别覆盖经历/未经历预算恢复的情况。

配套执行了已有协议守卫、工具渐进展开、observation、AppUIModel Recovery、真实 Operator Phase 3 契约、接管确认/拒绝/stale plan、Runtime 完成证据和透传断言测试。3 项既有 strict xfail 保留：未声明 Slot 错误语义抹平、重复成功请求仍 dispatch、旧 semantic no-op 完成标记未随真实修改清除。

两个旧 fixture 测试单列，不是通过：

- `test_general_route_creates_a_fresh_model_with_original_settings` 使用缺少 task intent 的旧响应 `GENERAL`，不符合当前路由协议。
- `test_deep_agent_receives_the_preinitialized_model_instance` 缺少 `.agent-ui/project.json`。

在修复前隔离包副本与当前代码分别执行，均相同失败，见 `fixture-before.xml` / `fixture-after.xml`；没有放宽协议或工程配置校验使其变绿。

Creator **build、typecheck 均通过**。`protected-content-check.json` 记录了提示词/skills hash 及五个实现文件和构建分发的一致性。实现仅涉及 Python 输入复制、校验与请求预算，没有引入平台路径、shell 或信号假设；尚未进行真实 Windows 实机验收。

## 真实接管确认复测：仍未通过

沿用原六项语料中的 `takeover_question`，只复测这一项；从相同安装的 Plugins/Operator 初始化独立 platform 工程，通过真实 Creator `/creator` ASGI/SSE、实际模型与 Operator 执行，不模拟模型决策，也不自动批准任何接管。

模型配置保持：mimo-v2.6-flash、temperature 0.2、通用 maxTokens 8192、单请求 timeout 120 秒、maxRetries 2；Selector 普通预算仍 512、reasoning_effort=low，新增恢复预算为默认 2048。

任务原文：

> 我需要修改 Composer 的上游实现源码，而不只是 props 或 JSX 包装。请先展示该插件的具体源码接管计划，等待我确认；确认前不要写入。

本次 **1 failed、5 deselected，108.52 秒**（单任务请求 104.03 秒）。没有 RUN_ERROR，没有异常，没有写入；但没有正式确认问题，因此不能视为任务完成。

Selector 本次一次正常返回 `READ_ONLY_EXPLICIT INSPECT`，未触发预算恢复，也未触发路由复核；领域 Agent 调用 4 次后返回普通文字计划，completion 标为 success。实际计划存在错误：把旧 source asset 的 `blocked / AGENT_UI_SOURCE_PATH_CONFLICT` 当成正式源码接管的前置阻碍，建议先移除/迁移应用层文件再执行旧安装流程。现有受控 takeover 应保留薄应用层，不能按这份文字计划执行。没有任何删除或接管实际发生。

对照证据：

| 样本 | 结果 | 单请求耗时 | 领域调用 |
| --- | --- | ---: | ---: |
| 2026-10-19 | 真实 takeover 工具生成正式确认问题，无写入 | 80.840s | 4 |
| 上轮首批 | 路由复核遭遇 HumanMessage `.get` 类型错误 | 274.099s | 18 |
| 上轮最终批 | Selector 输出预算耗尽，未进入领域 Agent | 15.508s | 0 |
| 本轮 | 无预算/路由异常；只读文字计划不正确，缺少正式确认问题 | 104.030s | 4 |

本次真实样本没有覆盖到 `length` 恢复或复核分支，不能把没有异常当作这些分支的真实模型验收；对应恢复与实际 Graph 分支由回归测试验证。这也不是性能基准，不对不同终止条件的耗时作收益结论。

`live/` 保留原始 JSON、SSE、脱敏日志、patch 与文件前后 hash，没有覆盖上轮证据。机器摘要见 `summary.json`。本次不收集 Runtime / 浏览器视觉证据，不能把静态或模型文字当作这些证据。

下一步缺口是 **只读规划如何获取当前正式 takeover 的 Host 事实，并区分旧 source asset 安装冲突、npm 应用层和可接管实现**。需要在保持只读边界的前提下解决，不能通过把只读请求强制改路由为写入来通过确认测试。本轮没有修改该事实接口或提示词，也没有放宽原验收断言。
