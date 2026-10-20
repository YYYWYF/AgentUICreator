# 只读 takeover 规划事实入口修复

本轮只修改 `packages/creator`，保留此前已有未提交修改；手册、skills、系统提示词、Selector 提示词及所有现有工具描述未改。没有新增模型工具或扩大权限，没有修改 Operator/Plugins，也没有替换或放宽原生确认和 hash 门禁。

## 实现

- 现有 `inspect_ui_plugin_source_references(pluginId)` 在读取引用后，按需调用现成的只读 Operator `plan_plugin_source_takeover`，返回与真实接管工具相同的精确计划。包含目标工程实际安装版本、planHash/stateHash/catalogHash、完整文件清单、实例、依赖和兼容性；不缓存计划，每次重新读取。
- `sourceTakeover.applicationLayer` 明确 `deleteBeforeTakeover=false`，保留 props、组合和实例身份，列出由 Operator 管理的 import 变更。`sourceItemInstallation.requiredBeforeTakeover=false` 区分正式接管与旧 Source Item 安装。
- `sourceTakeover.execution` 保留 `domain_write`、重新规划、原生用户确认的前置要求，且 `inspectionGrantsApproval=false`。只读检查不调用 apply、不提取源码，也不把计划 hash 当作 AppUIModel 写入 observation。
- `inspect_ui_plugin` 的 application 结果增加只读规划入口导航。旧 inventory 的原 status/issueCodes 保留，新增作用域说明：这些是 Source Item 安装状态，路径冲突不授权删除应用层，不能据此判定正式 takeover 是否可用。
- Operator 规划失败时保留独立的 `not_planned` 与原始错误码 / details，不伪装成成功或“没有接管能力”；引用事实仍可读取。缺失规划接口和无效计划身份也明确反馈。

实现集中在 `python/agent_ui_creator/domain_tools/operator_tools.py`，新测试为 `python/tests/test_takeover_planning_facts.py`。测试精确输出字段的既有断言随新增数据更新，其余接管确认验收断言未改。

## 回归与构建

实际执行 **702 passed、3 strict xfailed、2 deselected，73.37 秒**。两个 deselected 是上轮已确认的旧 model factory fixture 失败：旧 GENERAL 响应缺 task intent、缺 project.json；不计入通过。3 项已知 xfail 是未声明 Slot 错误语义丢失、重复成功 dispatch、no-op 完成状态未随真实修改清除。

聚合测试覆盖：takeover planning facts、Selector、真实 Graph 路由复核、权限、model factory、协议守卫、渐进工具、domain tools、tool context、observation、source grounding、Recovery、真实 Operator Phase 3 契约、源码接管确认/拒绝/失效计划、Runtime 完成证据及 JSX 透传断言。

新增测试直接使用真实安装的 Operator/Plugins 初始化两个独立 npm 应用层插件（composer、copy-action）：

1. 旧 Source Item 确有路径冲突，正式计划仍能生成；文件写入目标为 `plugins/<id>/source/`，应用层只有受控 import 变更，不要求删除。
2. 检查前后消费项目文件、应用层、AppUIModel、ownership、lock 状态不变，revision/修改回执不增加，AppUIModel observation 不被伪造。
3. 应用层外部变化后新读取产生不同 planHash/stateHash，旧计划未被复用。
4. 错误 pluginId/hash 的假计划不发布为可用；真实规划错误保留原始码，不缓存失败，后续显式读取可恢复。
5. 真实只读 Agent 在读到计划后尝试调用 takeover 工具仍被权限守卫拒绝，项目没有变化。

Creator build 与 typecheck 通过；存在既有 pnpm 配置弃用与大 chunk 提示。`protected-content-check.json` 确认原提示词/skills/工具描述未改，构建中的实现与源文件一致。

新实现只操作 Host JSON 和现有只读 Operator API；所有文件路径来自 Operator，未新增 OS 分隔符转换、shell 或进程假设。测试使用现有跨平台 Node fixture 和 junction。尚未进行真实 Windows 实机验收。

## 真实接管确认复测

沿用原 `takeover_question` 文本、模型配置、真实 Creator ASGI `/creator` SSE 和独立 platform 消费工程，不模拟路由或模型，不自动批准接管：

> 我需要修改 Composer 的上游实现源码，而不只是 props 或 JSX 包装。请先展示该插件的具体源码接管计划，等待我确认；确认前不要写入。

配置：mimo-v2.6-flash、temperature 0.2、通用 maxTokens 8192、timeout 120 秒、maxRetries 2；Selector 初始 512、恢复 2048、reasoning_effort=low。模型、接口和其余设置保持上轮条件。

**严格确认验收仍失败：1 failed、5 deselected，132.51 秒；单请求耗时 127.55 秒。** 没有 RUN_ERROR / exception / 文件修改 / 接管执行；completion 为 success 不能代替确认验收通过。

本次 Selector 首次输出被截断，原有一次恢复机会以 2048 token 成功返回 `READ_ONLY_EXPLICIT INSPECT`，candidateCount=0，没有权限升级。领域 Agent 用 3 轮读取事实并给出计划；实际 Operator 调用了 `plan_plugin_source_takeover` 一次。SSE 的工具结果 UI 预览有截断上限，不能将其当作完整 JSON。运行后在同一未变化的工程通过实际 Operator 再次只读获取完整事实，保存为 `observed-takeover-facts.json`；planHash/stateHash 前缀与真实回复一致，读取前后文件未变。该读取是额外审计，不计入运行的调用指标。

人工复核，本轮明确修复了上一轮的错误建议：

- 正确引用目标工程安装的包版本、计划 hash、state hash 和 `source/` 文件清单。
- 明确声明 `deleteBeforeTakeover:false`，应用层保留 props、组合和实例身份，仅由 Operator 切换 import。
- 明确说明旧 Source Item 即便 blocked，也不是正式接管的前置依赖，“不需要删除现有文件”。
- 没有建议先删除/迁移薄应用层，也没有实际写入。

原始响应中的相关语句：

> Source Item 关系：官方 plugin/composer Source Item 当前是 blocked（AGENT_UI_SOURCE_PATH_CONFLICT），但 requiredBeforeTakeover:false——接管直接安装上游源，不依赖该 Item，也不需要删除现有文件。

剩余失败点：模型仍只在文字中“请确认”，没有 `ask_user_question` 原生确认中断；只读权限下不能调用有写入阶段的 `takeover_plugin_source`。原测试继续要求正式确认问题，未修改断言把文本计划视作通过，也未通过开放只读写入来满足测试。

| 指标 | 上轮 | 本轮 |
| --- | ---: | ---: |
| 删除薄应用层的错误建议 | 有 | 无，人工复核 |
| 读取正式 Host takeover 计划 | 无 | 有，实际 Operator 调用与 SSE 事实 |
| 领域模型调用 | 4 | 3 |
| 领域累计输入 token | 57,776 | 31,897 |
| 原生确认问题 | 无 | 无，仍失败 |
| 项目写入 | 0 | 0 |

这是单次诊断样本，不保证所有未来模型回答都正确，也不构成稳定性能收益证明。Runtime 和浏览器视觉证据未采集。

本轮只读规划入口已补齐；接下来仍需解决**只读计划到原生确认的衔接**，明确该衔接如何继续保留现有写入权限和 hash/确认契约。原始 JSON、SSE、脱敏日志和 patch 保存在 `live/`，机器摘要见 `summary.json`。
