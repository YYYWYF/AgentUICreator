# 任务进度面板：日志诊断与优化建议

分析对象：Windows 上的 case08-progress-schema-fix-16k，2026-11-04。只分析现有记录，未再次调用模型，未修改生产源码或提示词。本报告不声称某项优化已经通过对照实验。

## 结论及证据边界

主要问题是：Creator 在已经形成可实施方案之后，继续围绕不一致的国际化指引、公开类型和缺失目录调查；上下文压缩反复消耗时间并放大约束，现有停滞检测又未识别出这种调查不收敛。

不是因本轮没有批准新插件、写工具未开放、输出达到 16384 上限或日志 EPERM 而不能动。这些排除有运行记录支持。底层模型为何选择每次查询，不能从工具日志直接还原；下文的因果排序是基于行为序列与代码的判断。

## 时间线

| 运行时间 | 可核对的实际行为 |
| --- | --- |
| 2:48 | enable_creator_tools 开启 integration、services、plugin_authoring、debugging。 |
| 3:33 | 读到业务事件文档 s316：appEventSchemas + manifest.data.events + usePluginEvents/useEffect 清理。 |
| 6:55 / 7:22 | 已解析 usePluginEvents、useAgentUILocaleCode、UIPluginEvents.subscribe、UIPluginManifest。 |
| 10:22 | prepare_ui_plugin_development 提交 job-progress-panel 方案，已写明按 job_id 更新、多任务、完成状态、错误展开和右侧 Row + Panel。 |
| 10:29 | 隔离 QA 选择“开始开发”；恢复调用返回 authorized。两次 prepare 是中断与恢复，不是两次审批。 |
| 10:50–16:53 | 继续查询 locale / AgentProps / 事件类型；8 次公开类型检查中 7 次涉及国际化。 |
| 14:08 | 读到文档 s423 的自定义双语消息写法，但后续摘要仍强调必须 useAgentUILocale。 |
| 16:00–17:03 | 分三页从归档重读刚读过的 authoring-contracts。 |
| 18:19 | 再次查找已确认不存在的 agent-contract 目录，继续搜索/重读。 |
| 20:00 | QA 正常停止；77 次可观察工具调用，源码变更 0，projectRevision=0。 |

确认之后 30 次调用全是读取或检查：inspect_ui_plugin 8、read_file 11、read_creator_documentation 3、inspect_ui_project 1、read_creator_context 3、ls 3、grep 1。没有一次 create/edit/mutate 源码尝试，也就没有“写入被拒绝”的证据。

35 次 Agent 请求中 34 次有完整返回，最大输出 6274 token；其余一次在停止时尚未完整返回。完整返回都是工具调用，没有 length 结束。模型请求元数据未记录 HTTP/流错误。源码写工具在批准后请求中持续可见。

## 1. 国际化指引确实存在冲突，而且运行卡在这里

Creator 的 ag-ui-frontend 技能第 124–126 行要求：新文案使用既有 useAgentUILocale 命名空间、完整双语字典，禁止每插件 i18n Hook 和语言条件。ui-plugin-development 也要求统一域命名空间。

但开发文档 plugin-api 的“主题与多语言”（本轮实际读到的 s423）让项目自定义业务文案定义 useTicketActionsMessages()，通过 messages[useAgentUILocaleCode()] 选择项目双语表。这与技能的禁止项直接打架。

实现也证明不能假设 useAgentUILocale 是任意项目命名空间注册器：

- packages/plugins/src/locale.tsx:8–9：消息与 overrides 类型都从官方 enUS 的既有键推导。
- 同文件 24–32 行：解析器只遍历官方字典的命名空间与键。仅增加类型断言或传入未知键，也不会使新命名空间被解析。
- 同文件 42–45 行：useAgentUILocale(namespace) 只接受 keyof AgentUILocaleMessages。

这一轮的查询顺序与此吻合：先找 UIPluginContractMessages（不存在），再到 /contracts 和 Runtime /ui 找 locale 类型（均不是导出所在模块），再查 Plugins 根导出，接着查询重载 Hook 的 $return，收到“Expected one call signature”，最后又读整套 locale 类型。

需要限定结论：现有 tasks 命名空间已经有任务、运行、失败、完成等文案，可以复用；因此不能断言这个面板绝对无法实现。真正缺少的是明确、可编译的“复用现有域 / 新增项目业务文案”边界和合法做法。模型既没有按现有域开始实施，也没有明确报告新键入口缺口。

建议优先统一硬约束、Creator 技能和公开文档：保留统一 locale、双语 parity 与禁止独立语言状态；为已有任务域提供可运行用法。若确需新的项目键，明确并验证项目自有消息扩展入口，不让模型通过改 npm/Runtime、类型断言或复制 i18n 状态绕过约束。当前根规则与公开示例的冲突应被显式解决，不能偷偷把示例当成放宽规则的许可。

## 2. 摘要把工具/技能规则强化成了用户要求

原始任务只有右侧面板、job_id 更新、多任务、完成和错误展开；没有指定国际化 Hook。

但后期原生 context_compaction.summary 的事实句是：

> Its example for custom business copy uses `useAgentUILocaleCode`. The task explicitly requires `useAgentUILocale`.

这句话同时保留了冲突和错误的要求归因。另一些摘要把邻居 test-notice 的双语表写法记为“observation, not confirmation of the preferred localization pattern”。因此即使文档和项目有例子，也没有形成可持续复用的实施决定。

不能说审批被压缩丢了：批准后的摘要及 live Host 状态仍保留 job-progress-panel 和 authorized。实际缺口是缺少简短、带来源的已解决 API/设计事实；working-context.ts 当前只稳定提供确认的 ID、ownership、policy 与部分源码，不提供完整 deliveryContract 或公开 API 事实缓存。

建议让摘要保留要求来源（用户 / 系统规则 / 技能 / 文档 / 项目观察），原样记录冲突而不裁决为用户要求。把批准的目标、已选生命周期与确实解析过的关键 API 简短保留在当前工作上下文，附模块、版本、来源与失效条件。它们不能授予权限、替代文件 hash 校验或证明行为通过。

## 3. 压缩成本成为主要放大器

- 18 次完成的压缩，20 次摘要模型请求（含 2 次重试），累计 694.95 秒，约占 20 分钟窗口的 58%。批准前后各 9 次压缩。
- 摘要从 3850 字符增长到 16913 字符，最后仍有 16097 字符；不断积累文件 hash、未做事项与过去查询。
- 两次压完后估算仍超 65536：71678 → 68011、71531 → 68032，紧接着再次压缩。两次第二轮都留下 0 条近期消息，只剩摘要与另外固定的请求/工作上下文；原始记录没有被删除。
- 扩展工具后固定预算通常约 4.4 万估算 token，其中已经包含 16384 的输出预留；可供消息部分使用的空间只剩约 2.1 万。此处是当前字节启发式估计，不是提供方 tokenizer 的精确计数。
- 摘要请求复用了同一模型与输出设置。不能因为它偶尔输出较长，就推断所有 Agent 调用都缺少输出预算。

建议先减少查询结果与摘要重复，再做预算调整：API 查询按具体导出/成员投影，不反复返回所有 locale 域；摘要保存完成事实、确定选择和真正待解问题，历史完整过程留引用；给摘要设独立的长度目标/模型输出预算，并为下一轮工具往返预留空间。须保留完整工具配对和必要推理续接，不能粗暴截断历史。更大上下文只在确认服务支持后评估；不继续盲目增加输出预留。

## 4. 停滞检测测到了内容新鲜度，没测到实施收敛

原生 evidence_progress 共 72 条：42 条 newEvidence=true，30 条 false；连续 unchangedReads 最大只有 4。因此既有“连续 6 次”规则没触发，滑动窗口规则本轮也未发出 review_stalled_investigation。

最具体的漏洞：authoring-contracts 在第 66 次工具调用已经整段读过，随后第 68、69、72 次从其归档分三页再读，仍全部记成新证据。EvidenceProgress 对 read_creator_context 落入通用结果指纹分支，归档页的 offset/content 等被当作新对象，没有映射回原始工具的来源与已读范围。

另一方面，新解析到一个 locale 类型确实是新事实，但未必减少了“如何实现面板”的不确定性。单靠修改读次数阈值，仍会被不同模块/不同符号查询打散。

建议先修正同一来源的证据去重，再加入调查收敛提醒：明确当前缺少哪项外部事实、已有证据解决了什么、下一次读取要消除什么疑问。已有实施路径且目录缺失只是待创建代码时，应引导做一个可撤销、可验证的实现增量；规则矛盾则明确报告矛盾。提醒不应强制写代码，也不应引入累计调用数或图步骤上限。

## 5. 事件入口与路径指引也有落差，但不是已证实的唯一阻塞

技能反复指定 /agent-contract/agent-events.ts，同时禁止 Application Events 用于 activity progress。实际项目没有那个目录，当前公开文档则明确支持通过 Agent.appEventSchemas 注册事件，并把 Schema 放在项目代码中。

模型在第 36 次查找该目录失败，第 74 次又查同一路径；而第 22 次已经读到可用注册入口。路径缺失应被识别为需要新增的项目实现，而不是继续寻找预置基础设施。

需要讲清标准 ACTIVITY/Tool 执行状态与用户明确给定的业务 CUSTOM 通知之间的边界：保留 AG-UI 语义，不擅自改后端协议；瞬时通知不等于历史状态恢复。当前记录没有证明模型因“activity progress”禁令而停止，所以这一点列为应修正的指引风险，而不是已确定主因。规范所有者需先消除冲突，不能靠模型猜测例外。

建议把路径写成相对于实际 sourceRoot 的项目拥有代码位置，明确目录可能尚不存在；给出最小事件面板例子，覆盖 Schema 注册、manifest 声明、React 订阅/清理和按业务 ID 更新，不把有额外 Service 依赖的工单例子作为唯一入口。例子是可复用参考，不把 Creator 改成固定生成流程。

## 建议实施顺序与验收

1. P0：统一国际化规则与可用 API，给出遵守当前硬边界的最小例子；校准 Application Event 的边界和项目路径说明。
2. P1：修复归档证据重复计数；让调查不收敛提醒能解释当前阻塞，而非仅返回“继续调查”。
3. P1：摘要保留要求来源与简短确定事实；调整结果投影和摘要体积，避免递归摘要不断膨胀。已批准方案的稳定保留属于改进项，不能把它说成本轮审批失忆的修复。
4. 使用冻结的同一输入、同一初始项目、同一模型配置，在独立临时项目做分组对照。先离线验证归档计数与摘要事实，再跑真实模型。不要一次同时改提示词、模型和全部预算后声称找到单一原因。

验收看首次实际源码写入、确认后的实施时间、最终修订静态检查、右侧真实几何位置，以及同 ID 更新不重复、多任务共存、完成状态、错误展开、非法 payload 不崩溃、卸载取消订阅和语言切换。QA 窗口是观察边界，不是产品运行上限。测试连接必须显式绑定受控 Agent，避免默认 Mock 覆盖 endpoint。实际 Windows 上验证路径与文件锁行为；此次分析没有新增实现，因此未运行新的工程测试。

## 原始证据

- [本轮结果](<WORKSPACE>/.agent-ui/creator/windows-tests/case08-progress-schema-fix-16k-2026-11-04T13-13-39-938Z/result.json)
- [逐事件时间线](<WORKSPACE>/.agent-ui/creator/windows-tests/case08-progress-schema-fix-16k-2026-11-04T13-13-39-938Z/events-timed.jsonl)
- [原生 JSONL](<WORKSPACE>/.agent-ui/creator/windows-tests/case08-progress-schema-fix-16k-2026-11-04T13-13-39-938Z/creator-records/logs/2026-11-04T13-14-09.252Z_f2dd0ba9d4d1419e20df796a833cc0c1a1625f9799e9d1a7ed58de602eb95810.jsonl)
- [关联后的调用、审批、摘要与元数据](<WORKSPACE>/.agent-ui/creator/windows-tests/schema-fix-20261104/progress-deep-analysis.json)
- [本轮实际原始请求](<WORKSPACE>/.agent-ui/creator/windows-tests/case08-progress-schema-fix-16k-2026-11-04T13-13-39-938Z/environment.json)

源码核对：packages/creator/skills/ag-ui-frontend/SKILL.md:24,33,39,124；packages/creator/skills/ui-plugin-development/SKILL.md:74；website/docs/development/plugin-api.md:427；packages/plugins/src/locale.tsx:8,24,42；packages/creator/src/agent/working-context.ts:7；packages/creator/src/agent/context-window.ts:21,94,125,214；packages/creator/src/agent/evidence-progress.ts:86,92；docs/architecture/p3r-0-assistant-ui-conversation-domain-rebaseline.md:45。
