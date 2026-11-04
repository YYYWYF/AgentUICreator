# reasoning_content 往返修复与原任务复测

日期：2026-11-04，macOS，Node v24.22.1。

## 结论

- 缺失的 reasoning_content 回传已修复，覆盖普通流、原生事件流、非流式调用和工具中断恢复。提示词、文档、Skills 未作本轮修改。
- 本轮不再零写入：第 31 次可观测工具调用、316.080 秒时首次写入；总计 5 次成功写入操作，10 个源码/生成文件发生变化。
- 独立浏览器 QA 通过：按钮收起、标题展开、深色主题下收起与展开。无浏览器 pageerror。
- Creator 原生最终状态仍为 blocked。静态与运行时观察通过，但新插件交付检查缺少行为测试证据。测试目标没有声明 @playwright/test，也没有对应配置，verify_ui_plugin_behavior 两次返回 PLUGIN_BEHAVIOR_INFRASTRUCTURE_UNAVAILABLE。外部 QA 的通过不回填或改写 Creator 的交付记录。
- 因此，这是实施能力与该单卡片交互的正向结果，不是 Creator 端到端全流程已通过，更不是所有复杂任务已稳定。

## 用户提出的能力疑问

原卡片把 expanded 放在组件私有 useState 中，headerActions 只渲染插槽，没有自动传递 setExpanded。已有卡片没有直接控制接口，但项目代码可以扩展。本轮模型自行创建 hooks/useQuickHelpCardExpanded.ts，把状态放入 React useSyncExternalStore 订阅的项目共享模块；卡片和按钮使用同一状态。未改 Runtime、vendor 或新增框架机制，也没有使用 Service。单卡片功能已通过实际点击验证；这不构成通用父子状态 API 或多实例隔离的验收。

## 对照条件

- 同一模型 deepseek-v4.1-flash，同一原始任务，同一初始源码和五个生产包快照。
- 上下文预算 65,536，保留目标 12,000，输出预算 8,192，温度 0.2，单请求超时 120 秒，压缩启用。
- 直接对照上一轮工程修复 run2。snapshot-comparison.json 核对提示词、Skills、面客/内部离线文档、摘要提示词均未变化；Operator 输入相同，bundle 仅随机 buildId 不同。
- QA 在新插件的原生确认界面选择开始，不代写模型答案，不干预实现，不模拟源码接管或依赖安装同意。
- 初始源码 SHA-256 集完全一致。测试在独立项目中执行，未修改维护中的示例 Host。
- 两轮都有 QA 的 1,200 秒观察期限；本轮自然结束，未触及该期限。该期限不是 Creator 的模型调用或图步骤上限。

原始请求：

> 给刚才的帮助卡片添加一个“知道了”按钮插件，放进 headerActions。点击后隐藏帮助内容，再次点击卡片标题能重新展开。切换主题后功能仍然正常。

## 测量结果

| 指标 | 修复前（工程 run2） | 本轮 |
| --- | ---: | ---: |
| 原生结束状态 | QA 超时停止 | blocked（行为验证基础设施不可用） |
| 耗时，秒 | 1200.359 | 727.56 |
| 可观测工具调用 | 97 | 52 |
| Agent 模型请求 | 49 | 40 |
| 摘要模型请求 | 12 | 4 |
| 首次新插件询问，秒 | 617.134 | 95.739 |
| QA 确认，秒 | 618.881 | 97.867 |
| 首次写入，秒 | 无 | 316.08 |
| 成功写入工具操作 | 0 | 5 |
| 变化文件 | 0 | 10 |
| 实际完成压缩次数 | 11 | 4 |
| 压缩耗时，秒 | 309.358 | 161.221 |
| 证据读取 / 未获新证据 | 93 / 41 | 37 / 8 |

Provider 累计 token（输入包括缓存；输出包括推理，二者不重复相加）：

| 统计范围 | 修复前 input / output / total | 本轮 input / output / total |
| --- | ---: | ---: |
| Agent + 摘要 | 1689512 / 111826 / >=1801338 | 1553127 / 44294 / 1597421 |
| 全部模型请求，含路由分类 | 1694577 / 111976 / >=1806553 | 1558192 / 44480 / 1602672 |

修复前取消了一个尚无 usage 的摘要请求，所以其 token 是下限。本轮 45 个 HTTP 请求全部 200，40 个 Agent 请求、4 个摘要请求和1个路由请求均有 usage。3条 AbortError 出现在已收到 usage 的流关闭时；Creator 无传输恢复/重试记录。

本轮原生执行器内部统计工具调用 53 次，可观测 TOOL_CALL_START 为 52 次。表格沿用前一轮可观测事件口径；内部统计另存于 results.json，不将两种口径混合。

## 修复证据与边界

- 根因是 SDK 接收 provider 推理字段后，下一次请求序列化遗漏该字段。原生事件流会把它存为 reasoning 内容块，普通路径会存为 additional_kwargs.reasoning_content，两种表示均已覆盖。
- Creator 自己的 Chat Completions 适配器通过 SDK 根导出的公开转换接口补回字段；不修改 node_modules / vendor，不复制 SDK 实现，不增加模型步骤上限。
- 每次请求通过独立选项携带原始消息，避免并发串线。DeepSeek 带工具请求中无历史字段的 assistant 补空字符串，其余普通模型无推理数据时维持原请求。
- 上下文预算计入额外 provider 字段；原生内容块已计入的内容不重复估算。原始消息与 checkpoint 不修改。
- 本轮 HTTP 元数据观察到累计 335 条历史 assistant 消息回传，335 条均含非空 reasoning_content。这里是跨请求重复计数，不是335次模型调用。只记录次数和字符长度，不保存推理正文。先前快照未启用该元数据统计，不能把它记为0；缺失证据来自单独审计与本地复现。
- 一次同模型对照支持修复有助于实施，但不证明是唯一原因，也不证明固定性能收益。两轮最终状态不同，不能按已完成的等价工作量计算吞吐。

## 验证

- Creator 全量 Vitest：50 文件、505 测试通过。
- 最终推理传输专项：7 测试通过；包含严格缺失字段400、本地 SSE 分片、四种调用入口、并发隔离、图 checkpoint 中断恢复。
- Node + 浏览器类型检查通过；Creator 构建及离线文档校验通过；git diff --check 通过。
- 模型生成目标项目：typecheck、build、delta 检查通过；首轮 capability/插槽声明不匹配由模型自行修正，未由 QA 代改。
- 独立 Playwright：按钮收起、标题重开、dark 主题收起/重开四项均通过。查看 run1/natural/verified-dark.png。
- 运行时布局查询出现一次 CREATOR_RUNTIME_LAYOUT_REFERENCE_STALE；之后完成当前页面的运行时观察，原生最终 runtime=pass，但 interaction=not-run。
- 本轮未修改提示词、文档或其他验证工程问题。Windows 已按平台无关的模型传输与本地 HTTP fixture 审查，未做真实 Windows 运行，不宣称 Windows 验收。
- 自建 Creator 进程已退出（cleanup.json），未停止用户已有服务。

## 证据文件

- results.json / results.csv：原始指标与对照。
- snapshot-comparison.json：实验输入一致性。
- run1/model-http-requests.json：HTTP、usage、推理字段长度元数据。
- run1/natural/events-timed.jsonl：按时刻记录的工具与交付事件。
- run1/natural/result.json：原生 blocked 记录和独立浏览器通过结果。
- run1/natural/host/src/agent-ui：本轮模型生成的实际源码。
- tests.log / reasoning-tests.log / typecheck.log / build.log：工程验证。
