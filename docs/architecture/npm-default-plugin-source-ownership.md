# 统一 Plugins 包、内置源码目录与按需源码托管

> 2026-10-21 开发工具合包：Operator 的 Node 加载、接管、三方合并、校验与更新职责保留在 `packages/creator/operator`，随 Creator 发布；使用 `@za38.03/agent-ui-creator/source-registry` 和 `/operator/*`。公共包现为六个，本文早期“七包”记录为历史阶段；Plugins 仍是独立生产包，源码所有权与显式确认要求不变。

> 当前未发版的交付统一：官方插件仅保留 43 个无前缀 ID。删除 19 个重复的 `assistant-ui-*` 插件及 `message-footer`，仅保留 `response-footer` / `assistantResponseFooter`。Footer 依然按用户请求划分整轮，只渲染于该轮最后一条 assistant 消息下；复制、导出、重新生成与分支操作继续使用整轮作用域。本文下方此前关于保留双套插件 ID 的实施记录不再作为当前约束。上游源码、来源记录、同步映射、应用层与实现源码的所有权边界不变。


状态：Accepted，2026-10-17；新增“用户本地薄应用层、props/组合优先、实现源码独立接管与合并”决策。包合并、薄应用层及确认接管/独立源码同步已通用化；当前 44 个现代官方插件均已接入，另保留旧 Composer ID。实现同步复用 Creator 更新页、模型合并和验证后采用基线；旧工程自动分层迁移与全库上游公共 API 审计仍未完成。

统一更新中心的新增决策见 [统一更新中心与兼容版本清单](unified-update-center.md)：只读发现官方更新、跨包兼容组合、区间累计变更与逐版本记录、用户确认后统一安装 npm 包，再可选同步托管源码。该决策取代“用户必须手动升级 npm”的阶段方案；2026-10-18 已实现可配置清单的只读在线发现和版本变更展示；npm 产物核验、受控安装/恢复及工具升级仍待实现，不能以已有源码同步验收证明安装能力已完成。

本文是官方插件交付、源码接管和更新的当前边界。Source Registry 合并到 `packages/plugins`，不再作为独立 npm 包发布；插件运行产物、源码快照、版本与来源目录统一由 `@za38.03/agent-ui-plugins` 交付。这取代此前“独立 Registry 包”和“默认全部源码交付”提案，以及旧包交付方案中禁止任何源码接管的规定。Conversation Domain、AppUIModel、语义 Slot、单 Runtime 和独立生产构建的职责不变。

## 新接受的应用层边界

每个官方插件在用户工程中保留一个很薄的、用户拥有的应用层。默认直接引用 npm 包的公开组件，不复制官方实现；需要定制时，Creator 在这层 JSX 中传 props、组合 children/子组件、替换 renderer 或使用公开扩展 API。只有这些方式无法满足需求且确实需要修改实现时，才询问用户是否接管当前安装版本的源码。应用层的创建和普通修改不是源码接管，不需要接管确认。

AppUIModel 仅负责布局、实例身份、启停和语义组合，不负责 React props、renderer 或上游基础组件配置。现有实例字段保持兼容，本决策不直接删除现有 JSON 字段或修改 Schema。

用户应用层与可接管的实现源码是两个所有权和更新边界：包升级、快照提取及实现源码三方合并均不得覆盖用户应用层。接管仅切换其实现引用，保留已有 props、组合及插件身份。此目标替代本文旧的“注册表在 npm 定义与本地定义之间直接切换”方式；当前 Composer 薄层试点已按此实现，兼容旧目录接管仍保留原路径。

## 当前已实现阶段

- 独立 `packages/source-registry` 已移除，公共包清单从八个变为七个；Operator 依赖 Plugins，并通过 `/source-registry` 工具入口提供原加载/历史 API。
- 63 条新旧名称插件资源的工程源码归入 `src/plugins/<id>/adapters/project/`；插件专属上游与产品展示适配分别归入 `upstream/`、`adapters/presentation/`，共享文件归 `src/shared/`。
- 保留原字节和逻辑相对导入，`source-layout.json` 在构建时生成被忽略的 `src/internal/vendor-generated/assistant-ui`、`src/internal/adapters-generated/assistant-ui` 兼容视图。工作区 Operator 直接按映射读取 `src/plugins` 唯一 owner；发布构建才把 Plugin 资源视图写入 `dist/resources/registry/`。测试和类型检查在运行期间临时生成旧资源路径并在结束时清理。它们不是第二套手工源码；上游更新同步回唯一 owner，删除也必须同步。
- 当前元数据采用 `plugin.json` / `CHANGELOG.json`；下文目录中的根定义入口和 Markdown changelog 是后续整理目标，未强行改旧 Source Release 的字节/格式。项目相对导入由生成视图维持，不能把当前源码快照宣称为已实现通用一键接管。
- Plugins 同包生成 catalog、540 个受管源码文件快照及 78 条可发布资源（源码目录含 79 条，A2UI 排除）。62 个上游文件与迁移前工作区逐字节一致。测试历史保留在工作区，不随 tarball 分发。
- 现有运行入口、Composer、资源安装和旧三方更新保留。确认接管/本地引用切换现已支持声明完整 portable closure 的 npm 插件；43 个现代官方插件均已完成默认包化，旧工程 ownership 自动迁移仍未实现；Composer 新 ownership 的显式源码同步已接入更新页。


## 通用交付与分批接入（2026-10-17）

`src/catalog/plugin-delivery.json` 统一声明公开组件名、入口、唯一展示 owner、可提取文件、共享 API、服务及必要的渲染 scope。构建脚本从这些 owner 同时生成运行入口与 portable snapshot；没有另一份可独立修改的官方实现。Operator 读取用户实际安装版本的 catalog，Creator 读取同一 catalog 判定实现写入边界。生成器按工程实际安装 catalog 过滤可用入口，不把新 Operator 中的条目强加给旧包。新条目必须通过服务元数据、快照/运行摘要、类型和生成工程验证，才能加入此清单。

| 批次 | 插件 | 本轮开放的应用层定制入口 |
| --- | --- | --- |
| 已有 | `composer` | input/root/dropzone、children、renderer 等已有公开接口 |
| 第一批 | `copy-action`、`reload-action` | 按钮 DOM/样式/事件、tooltip、children；保留运行禁用及默认动作保护 |
| 第一批 | `feedback-actions` | helpful/notHelpful、positiveProps/negativeProps；继续使用共享反馈能力 |
| 第一批 | `export-markdown-action` | menuLabel、buttonProps、menuItemProps；继续使用已有响应导出与更多菜单 |
| 第二批 | `reasoning` | rootProps/triggerProps/contentProps/textProps、children |
| 第二批 | `tool-group` | rootProps/triggerProps/contentProps、children |
| 第三批 | `add-attachment-action` | 原生 actionProps、按钮 DOM/样式/事件、label/tooltip、children |
| 第三批 | `dictation-action` | dictateProps/stopProps（含原生 actionProps、标签、按钮参数），或 children 组合 |
| 第三批 | `submit-action` | sendProps/cancelProps、原生 actionProps、children；保留队列与发送保护 |
| 第三批 | `response-footer` | rootProps/actionBarProps/branchPickerProps、children，语义 actions 仍由 renderSlot 供给 |
| 第三批 | `conversation-suggestions` | root/trigger/title/description props、完整原生 suggestionsProps、renderSuggestion/children |
| 第四批 | `thinking-indicator` | 原有 scope policy、indicatorProps（含 label、elapsed、DOM 和样式） |
| 第四批 | `tool-timeline` | rootProps/timelineProps、details/trigger/content props、默认及受控展开、children |
| 第五批 | `tool-fallback` | root/trigger/content/args/result/error/approval props、受控及默认展开，公开 Root/Trigger/Content/Args/Result/Error/Approval 组合 |
| 第五批 | `transient-assistant-messages` | rootProps/textProps、renderMessage；沿用原消息锚点、角色、错误无障碍语义 |
| 第六批 | `agent-status-message` | rootProps/statusProps、renderStatus、Fallback；状态仍投影自实际 tool 生命周期 |
| 第六批 | `agent-plan-message` | rootProps/planProps、renderPlan；保留 AG-UI activity 路由与显式 payload 校验 |
| 第六批 | `job-progress-message` | progressProps/renderProgress、Fallback；应用层传入既有 state/abortRun |
| 第六批 | `generated-file-message` | fileProps/renderFile、Fallback；保留成功状态与文件 URL 校验 |
| 第七批 | `chart-message` | figure/caption/list/item/label/track/bar/value props、formatValue、renderItem/renderChart；CSS 纳入源码闭包 |
| 第七批 | `source-citations-message` | rootProps、sourceProps 工厂、renderSource/renderSources、Fallback |
| 第七批 | `retrieval-chunks` | retrievalProps（含 DOM、visibleCount、部分 labels）、renderRetrieval、Fallback |
| 第七批 | `web-search` | searchProps（含 DOM、visibleResults、cycle、部分 labels）、renderSearch、Fallback |
| 第八批 | `conversation-thread-list` | aside/list/showSearch/search/item props、行组件替换、children；保留分组、禁用与重试；新建入口使用独立插件 |
| 第八批 | `conversation-new` | root/new/tooltip/content props、children；原生新建和 preventDefault |
| 第八批 | `conversation-quote` | preview/toolbar props、renderPreview/renderToolbar、children；共享引用生命周期 |

这份表描述已接入接口，不代表全库上游参数审计已经完成。反馈、更多操作文案使用统一 locale；不修改 vendor。动作读取同一个响应 Context；推理组和工具组的薄应用层从 Host 已有语义 scope 取 group/children，通过 props 传入 npm 或本地实现。组件不创建 Runtime、不持有另一套 scope Context。

初始化为现代条目创建薄层；重复执行不改已有薄层。Creator 普通 props/组合修改无需接管确认；实现写入仍须先走原生确认，拒绝或未答复不写入。接管保留插件/实例 ID、AppUIModel 和应用层原字节，只机械替换实现 import，并在 source/ 中安装准确版本的展示适配闭包。除 Composer 外的已接入现代插件共用 `plugin-support`（API 1），Composer 保留 `composer-support`（API 1）；共享上下文、primitives、样式及 locale 仍由 npm 提供。

npm 替换不修改已托管实现、BASE 或应用层；之后在 Creator 更新页调用同一实现同步服务，三方合并范围仅为 source/，验证通过后才推进 BASE。共享 API 不兼容、包身份不匹配、运行/快照摘要变化均拒绝执行，要求重新规划。

新增 ID 可能已有迁移前源码：具有有效 manifest/definition 的目录保持原有本地来源及定制，无论是否有旧 source-lock；不会擅自套薄层、删除源码或生成接管同意记录。它仍走旧源码更新机制，自动分层迁移尚未实现。未知/不完整目录仍作为冲突报错，禁止覆盖。

截至第九批，43 个现代官方插件均已接入，详见最新 inventory。旧 `assistant-ui-*` 资源 ID 和历史 BASE 保持兼容，不批量改写用户工程。

## 第三、四批的闭包与验证（2026-10-17）

通用 scope 桥接不再假定所有插件都接收 group：应用层依据自身组件的 props 接收 Host 已有 scope，思考策略和时间线 children 同样直接传入实现。它不创建 Runtime 或 Context，也不把 props 写进 AppUIModel。

附件、语音和发送/停止的展示实现由各自插件目录唯一持有，旧 public facade 与内部入口转发至同一 owner。发送保护、原生动作、队列与状态 gating 保留。思考展示及其 policy 同样归插件目录；时间线与思考共用的工具状态投影仍由共享 npm support 提供。原始 upstream 文件保持不变。

建议提示的 CSS 和相应类型声明纳入 portable closure；npm 插件入口显式引入构建后的 CSS。接管同步可以处理样式和多个适配文件，应用层仍独立保留。可提取实现并非只有一个 TSX 文件。

Slot 静态校验也按官方 delivery 元数据识别薄层委托：只有把相应 renderSlot/renderScopedSlot 传给正确的官方组件，才认定其语义子 Slot 已委托；显式丢弃回调会报错。源码托管后继续检查实际本地调用，不能只凭 application 标记跳过校验。


## 第五批：工具回退与临时消息（2026-10-17）

`tool-fallback` 的完整产品展示适配（包括审批、问题选项、重试、interrupt 与焦点恢复）归其 `adapters/presentation/tool-fallback.tsx`；npm、旧 facade 和 portable snapshot 共用此实现。原始 assistant-ui upstream 保留不动；旧内部适配路径仅转发到该 owner。生成器根据 delivery 的 upstreamBridge 与 reviewedAdaptedSha256 校验已审查的上游适配结果，再生成转发，不会重新复制或覆盖产品 owner。上游或旧生成 recipe 变化必须先审查合并 owner，再更新桥接基线。它不是用户源码同步的 BASE；用户仍使用精确版本 snapshot 的 BASE/LOCAL/TARGET。

Host scope 的 tool 对象由薄应用层原样传入，应用层可定制卡片各部分 props，也可用公开 compound parts 组合。默认审批参数和行为保持原有逻辑，approvalProps 的焦点事件与内部恢复逻辑组合，不覆盖内部处理。已排队回复的展示文案补入统一 toolPresentation locale。共享导出在 render 时解析图标，避免 support 与响应组件循环初始化时固化未初始化值。

`transient-assistant-messages` 的可托管部分仅是展示代码；消息服务、订阅 Context、锚点计算及 canonical Runtime 仍共享 npm 实例。应用层可使用 rootProps/textProps 或 renderMessage；默认错误 alert、角色标签和消息位置保持。临时消息不写入真实消息、历史或 Agent 请求。

两个新条目复用 Creator 原生询问、精确版本提取、静态 import 切换及更新页 source-only 合并。重复初始化保留已有薄层；新旧本地定制、应用层 props、实例 ID 与 AppUIModel 均须在生命周期验证中保留。专用工具结果 / data-message 插件仍待后续批次，不将它们伪装成仅有 Component 的普通 UI 插件。

## 第六批：状态、计划、任务进度与生成文件（2026-10-17）

本批是 headless 消息插件，实例保留在 applicationPlugins，不能放入 Layout Slot。delivery/catalog 声明 registration 的 kind/name：状态、进度、文件分别保持 toolkit 的 mock_agent_status、run_ci_job、generate_file；计划保持 data-message 的 agui-activity/agent-plan。薄应用层 definition 显式注册其本地 renderer，Component 返回 null；不能仅复制旧的 Component 薄层模板而丢弃注册。静态 data-message 校验继续读取应用层的 defineDataMessageUI。

可提取源码由每个插件的 adapters/component.tsx、adapters/package-definition.ts 与 adapters/presentation/ 中的展示/投影文件组成。npm 与 snapshot 共用这些 owner。旧资源入口保留原导出名，转发到相同的现代实现；旧 foundation 投影合同和文件结果 helper 保留兼容，不擅自改写用户已经安装的旧源码或 BASE。新旧定制目录仍按既有优先级解析。

任务进度的 runtimeContext 交付标记仅指导工具生成薄层：使用工程已经存在的 useAgentState/useAgentRuntimeActions，把 state/abortRun 作为 props 传入；npm 与本地实现都是消费者。直接使用公开 JobProgressMessagePlugin 时，调用方应提供已有 state/abortRun。插件不会创建 Runtime、订阅另一份 AG-UI 数据或复制 Host Context。其原有 requires-action 回退、终态 outcome、elapsedMs 和取消行为保留。

source-only 同步不合并应用层，包括其中的注册和 state 桥接。新增 ownership 的可选 applicationContractHash 记录组件名、scope、注册 kind/name 与 Runtime 桥接约定；与新目标不兼容时拒绝源码同步，要求另行迁移应用层，不自动切换路由或改写定制。历史无此字段且没有新增注册合同的 ownership 仍能做兼容同步。当前不提供不兼容应用层合同的自动迁移。该记录不是新 Runtime 状态，也不替代源文件 BASE。


## 第七批：图表、来源引用、检索与网页搜索（2026-10-17）

四个条目沿用 headless 消息交付协议。chart 仍是原生 data-message 名称；search_sources、search_docs、web_search 仍是只负责展示的 backend toolkit 注册，不增加执行能力。chart 的 manifest 仅声明 data.messageUI，不为接入而改写 capabilities；它仍放在 applicationPlugins。目录与消费代码必须支持合法的可选 capabilities。

图表为产品自有展示，adapters/presentation 保存数据校验和完整图表 JSX，原 style.css 及新增 style.css.d.ts 纳入 portable closure。npm 子路径显式加载构建 CSS；源码入口加载本地 CSS。保留有效数据的标题、值和比例规则；非有限数字或畸形数据不再触发渲染异常，而是与计划插件一致省略无效展示。应用层可覆盖各级 DOM props、数值格式或组合完整图表。

来源引用保留 URL/document 判别类型、唯一 ID 与 URL 校验，开放完整 sourceProps 工厂及单项/列表 renderer。默认 Fragment 结构保持；只有传 rootProps 时才增加外层容器。检索/搜索沿用原流式结果投影、终态校验及 requires-action/error 回退；薄层可传 props 或替换 renderer，无需接管。原语包装层补齐 DOM props、visibleCount/visibleResults 和 cycle，默认仍显示全部结果、cycle=0。

工程已有的 searchTools 文案域提升到 Plugins 统一 locale，保持原中英文键和值，也使既有 Host messages.searchTools 覆盖继续生效。没有增加插件私有语言状态或修改 vendor。旧资源入口保留原导出名，转发到唯一适配实现。资源目录的 web-search/retrieval-chunks 从源码默认安装切换为标准 npm 插件入口，保留原 ID；实际消息注册和实例 placement 不变。

Creator 确认、精确版本提取、静态 import 切换和 source-only 三方合并均复用上一阶段机制。验证涵盖图表 CSS、展示及投影文件定制保留，应用层字节/props、插件与实例 ID、配置、消息路由和重复安装。已在真实生成工程完成四插件官方入口安装，并在浏览器通过本地 AG-UI 服务验证网页搜索的 npm props 定制、接管后本地修改与页面效果；未调用真实模型。旧 fixture 修复继续暂停。

## 第八批：会话列表、新建与引用回复（2026-10-17）

当前三个插件沿用同一交付清单、npm 默认入口、原生确认接管与 source-only 同步。`hostBindings` 声明 conversation-list / conversation-selection / theme / run 的薄层绑定：薄层读取用户工程现有服务与 Context，通过 props 传递 snapshot、refresh、activeConversationId、theme 和 runStatus。可接管的展示实现不复制服务、订阅 Context 或 Runtime。列表使用 canonical navigation 加载/重试历史，新建仍由上游原生动作处理。

`railAction` 声明列表侧栏动作的额外导出；npm definition、薄层 definition 和本地源码入口都保留 RailAction，接管机械切换同一条静态 import，不重建定义。新增绑定及 RailAction 纳入应用合同摘要，旧条目没有新字段时摘要不变。不兼容绑定必须独立迁移应用层；源码同步不改它。

Assistant/Embedded 默认页头直接声明 `conversation-thread-list`；Operator 初始化时按 Mode 选用该插件的项目应用层模板，由应用层以 `AgentUIPopover` 包裹公开的 `CanonicalConversationThreadList`。会话变化时关闭弹层；新建入口由独立插件提供。旧的独立历史入口插件已移除；Platform 继续使用 thread-list 侧栏应用层。AppUIModel 不增加弹层或包装字段，也不引入额外的 HistoryPopover 组件。引用保留共享 quote 清理、选择、发送上下文及历史还原，不把引用状态复制进插件。统一 locale 增补既有 Host conversationQuote 和 threadList 的标题/重试键；Host 覆盖保持有效。图标经已有 plugin-support 共享接口取得，提取后不隐含依赖用户额外安装图标包。

已有定制旧目录继续优先，不自动重写。

## 第九批：补齐所有现代官方插件（2026-10-17）

本批完成 `agent-identity`、`auth-account`、`auth-gate`、`conversation-command-source`、`conversation-data-source`、`conversation-service`、`conversation-surface`、`lexical-composer-input`、`lexical-edit-composer`、`locale-provider`、`mention-trigger`、`message-footer`、`slash-command-trigger`、`task-group`、`theme-provider`、`theme-switch`。现代插件共 43 个，pending 清单为空；19 个历史 `assistant-ui-*` 资源继续兼容，不强制迁移用户旧代码。

这些插件需要工程已有的 Host 绑定，不能统一套只有 Component 的模板。delivery 的 `hostApplication` / `applicationFiles` 声明应用模板；初始化读取工程实际安装 catalog 的文件和摘要，校验路径、大小写重复、符号链接和 SHA 后事务写入。重复初始化保留已有应用层与有效旧源码，不把模板放进实现 BASE。身份配置、认证适配与连接配置属于应用层。

六个 provider 的包定义提供 `bindSetup`；应用 definition 绑定现有 Host 的服务工厂、连接参数及 cleanup，源码实现可扩展 lifecycle，但不会复制服务 Context、订阅 Context 或 Agent Runtime。泛型委托保留 Host 自己扩充的服务类型，未绑定的包 definition 直接 setup 会明确失败。主题、locale、认证的纯服务 helper 由插件适配目录唯一持有，旧入口转发到同一 owner。共享认证声明由 catalog 的 `application.sharedFiles` 只在缺失时初始化到 `services/auth/session.ts`，现有文件保持原字节；它不是某个插件的 source-only 合并对象。账号展示尊重 Host 身份（包括 null），认证仍需工程配置真实 adapter，不自动启用 mock。

| 插件 | 薄层入口与保留的行为 |
| --- | --- |
| agent-identity | 工程 config；root/image/name/description props、children |
| auth-account / auth-gate | Host 身份与 auth session；触发器/内容/退出及表单/输入/提交 props，保留取消事件与密码清理 |
| conversation-surface | 既有 ConversationAdapter、snapshot、语义 Slot/renderer 回调；root/adapter props，不复制 Host Context |
| task-group / message-footer | 原有 scope 和 actions Slot；group renderer/root 组合；旧 footer 继续委托 canonical response footer |
| lexical-composer-input / lexical-edit-composer | 完整原生 input props、children/plugins/formatter/submitMode/ref 等组合；编辑 inputProps/input，未知指令仍降级 textarea |
| mention-trigger / slash-command-trigger | 工程 sources、原生触发器 props、部分统一 locale labels；保留已有命令/提及行为 |
| theme-switch | 既有主题服务、root/select props、children；取消事件与实时订阅 |
| auth/locale/theme/command/data/conversation providers | 应用 setup 绑定、现有服务生命周期与清理；源码同步保留 Host 配置 |

Lexical 是可选能力，相关实现只从 `/lexical` 及其插件子路径进入；默认根入口不引入 Lexical。公共 input 类型以双向类型检查验证与 pinned upstream 一致，不向公共声明泄露内部 vendor 路径。接管提取的实现真正落入 source/，应用和定义的同源 import（含类型）一起机械切换；auth 类型仍由源码入口导出。

新 Host 模板及服务元数据加入应用合同校验；不兼容目标须独立迁移应用层。npm 替换和源码三方合并只更新实现，不更新应用 config、Host adapter 或共享服务声明。使用合成 0.0.2 验证更新/冲突合并；尚未发布 npm 新版。旧 fixture 修复继续暂停；本批不宣称已完成全库上游可配置参数审计。

## Composer 薄应用层试点（2026-10-17）

- 默认注册生成与官方安装为 Composer 创建 `application.json` 标识及本地 definition/index/manifest；manifest.json 是兼容现有目录结构的缓存；包模式的运行定义和 inventory 从已安装包读取权威 manifest，接管后使用 source/ 的本地声明。重复执行不重写应用层。已有未知或定制旧目录拒绝覆盖，不自动迁移。兼容旧名继续保持原接管方式。
- `/composer` 新增 `ConversationComposerPlugin` 组件公开导出，保留默认 Plugin definition。应用层可以传 `inputProps`、`rootProps`、`dropzoneProps`，以及现有 ReactNode 组合入口；输入参数使用上游准确类型，Root onSubmit 与发送保护组合。
- 接管仍复用真实 human-input 确认；薄层工程把完整 portable closure 安装到 `source/`，通过 TypeScript AST 仅改组件 import 和定义合同 import，保留 CRLF、已有 props/JSX 和实例/布局。BASE 只包含 `source/`；已有源码目录的旧接管保持兼容，不自动重排。
- `@za38.03/agent-ui-creator/operator/dev` 导出 `planPluginSourceSync` / `syncPluginSource`，以当前实际安装版本快照为 TARGET。计划提供 BASE/LOCAL/TARGET；按文件三方相等规则保留无冲突定制，冲突要求提供审查后的合并文本。先在临时工程验证，再事务提交实现和基线；应用层字节检查独立执行。Creator 统一更新页通过 OwnedPluginUpdateService 接入此 API，展示已托管状态、安装包版本、插件版本和 changelog；同步计划只包含 source/。无冲突可验证执行，有冲突可回到真实 Creator 会话进行模型合并，然后返回更新页显式验证并推进基线。模型不自行更新 BASE。
- 旧 Source Release 更新入口跳过薄应用层，新 ownership 插件路由至独立实现同步服务，不能借旧合并流程覆盖应用层。计划绑定工程、BASE、目标 catalog 与应用层/配置摘要，过期或变更后要求重新计划；校验失败不推进基线。当前每次只同步一个已托管插件，混合批量更新禁用。共享 Runtime、主题及 API 仍需兼容检查。

## 当前第二阶段：询问、接管与本地引用

Creator 的 `takeover_plugin_source(pluginId, locale)` 工具先通过内部 Operator 操作
`plan_plugin_source_takeover` 读取目标工程实际解析的 Plugins 包。工具以真实
LangGraph human-input 中断询问源码托管意愿，仅展示托管责任、npm 升级不覆盖本地源码、后续同步与兼容性注意事项，不把内部文件清单、路径或哈希放入确认文案。内部仍保存精确计划；模型不能传入 approval 或 planHash 代替用户决定。
用户拒绝/未答复不写源码；恢复时答案绑定计划 hash，包/工程变化使旧决定失效。
内部 apply 操作再次校验计划，在临时工程完成注册生成和 Host 已有的
`typecheck` / `build` / `test`（build 必须存在），最后才事务提交。

当前现代 npm 入口为 `composer`、`copy-action`、`reload-action`、`feedback-actions`、
`export-markdown-action`、`reasoning`、`tool-group`，加上上表第三、四批的七个插件，以及第五批两个、第六批四个、第七批四个和第八批四个插件，
均支持薄应用层、确认接管和 source/ 同步；
`assistant-ui-composer` 保留旧式接管兼容；第九批补齐其余 16 个现代条目。catalog 的 `takeover` 显式描述
可提取的文件、机械导入转换来源、摘要、共享 API 和兼容版本；不具备该声明的
插件拒绝接管。构建产物也有匹配摘要，发布校验同时核对快照与运行文件。

Composer 主体、队列和 textarea 的唯一展示实现归
`src/plugins/composer/adapters/presentation/`，由运行构建和 portable snapshot 共用。
接管时 wrapper 的导入机械改为本地 `adapters/composer`，不是继续调用 npm 中
同一插件的整体组件。它没有独立的 raw upstream 展示文件需要提取；assistant-ui
状态 primitives、唯一 Context、发送保护服务以及共享附件/按钮展示由 opt-in
`@za38.03/agent-ui-plugins/composer-support` API 提供，兼容合同版本为 1。
主题、全局样式与统一 locale 仍共享包 API，所以不承诺升级 npm 后所有视觉/运行行为冻结。

工程的 `<metadataRoot>/plugin-ownership.json` 保存按 ID 的来源选择、精确包/插件版本、
批准计划与 catalog 摘要、来源映射、共享依赖和可离线恢复的原始 BASE 字节/摘要。
它不改变旧 source-lock 的身份语义。源码、注册表、ownership 与 source-lock 共同记入
现有持久事务；中断可回滚，接管新建的空目录也会清理以便重试。
注册器对薄应用层、正式 ownership 或有效的迁移前本地源码只选择一个同 ID 定义，并排除重复 npm 定义；已接管实现的本地 manifest/服务声明
是权威。缺失本地实现时明确报错，不自动切回包实现。

npm 包替换、注册表重生成与旧 source→package 迁移不修改此 ownership 或本地文件。
共享 API 不兼容时检查报告错误。Composer 薄层试点新增了隔离实现子树的显式同步 API；
旧目录接管仍保留兼容路径；现代条目统一复用更新页的实现同步服务，不得通过旧资源安装或旧更新操作隐式覆盖应用层。


## 1. 一个包中的实现与源码目录

**Plugins 包同时交付可运行实现和对应的源码材料；Registry 仅指这个包内部的目录、索引与快照能力，不是另一个包或另一套实现。Operator 是工程变更执行者。** 不再要求用户或工具单独安装、升级 `agent-ui-source-registry`。

| 职责 | Plugins 的实现部分 | Plugins 内置目录/快照部分 | Operator / Creator |
| --- | --- | --- | --- |
| 编写官方插件组件、适配和定义 | 维护唯一官方实现 | 不维护第二份实现 | 不直接修改已发布包 |
| 默认运行 | 一个 `agent-ui-plugins` npm 包提供公开插件入口 | 不进入生产前端 | 初始化/安装工具生成包引用 |
| 描述有哪些插件、包版本对应什么源码 | 产出权威元数据和来源记录 | 索引并校验元数据，按精确版本提供源码快照 | 查询目录并解释给用户 |
| 提供源码接管材料 | 从同一构建输入产出可提取源码及依赖清单 | 提供与包产物可校验对应的不可变快照 | 用户同意后安装并切换引用 |
| 项目定制 | 完整保留上游公开参数、组合接口和上下文，提供稳定组件入口 | 提供实现参考和官方基线，不包含用户应用层 | Creator 始终先改用户应用层；不足时询问接管，之后再改实现适配层 |
| 同步新功能 | 发布新版包和对应源码 | 提供 BASE / TARGET 和变更信息 | 读取 LOCAL，规划、合并、验证并提交基线 |

例如 reasoning：完整官方实现维护在 `src/plugins/reasoning/`；未接管时项目引用包入口；用户同意接管后，从该安装版本包内的 `dist/sources/plugins/reasoning/` 提取对应源码。本地定制保存在用户工程，不回写为包内官方实现。

目标构建关系：

```text
Plugins 的唯一官方实现（每个插件包含 upstream 与 adapters）
  └─ 构建 → 一个 agent-ui-plugins npm 包
              ├─ dist/plugins/：默认运行入口
              ├─ dist/sources/：匹配本包版本的源码快照
              └─ dist/catalog.json：生成的版本/来源/快照索引
              用户工程薄应用层默认引用运行入口
                          ↓ 用户同意接管，Operator 执行
              提取 source/ 实现，只切换应用层 import
```

源码快照与 catalog 是自动生成的发布资产，不是第二处可独立编辑的实现。模板、项目初始化资源和 Demo 可由 Plugins 包内的 `resources/` 维护；Bootstrap 编排仍归 Operator，Mock 仍归 Creator。不因合包删除旧 Registry 中的非插件资源，也不把它们变成默认运行的官方插件。

npm tarball 同时包含运行产物和开发工具要读的资产；这不等于浏览器 bundle 必须包含源码。运行入口不得反向导入目录读取器、快照、Node fs/crypto、Operator 或 Creator。工具读取通过独立公开资产入口完成，不从 React 根 barrel 加载。准确 exports 与目录 Schema 在实现阶段落地。

## 2. 目标目录与文件职责

以下是已接受的最终目标结构；当前合包的落地差异见前面的“当前已实现阶段”。目录按需存在，完全自研插件可以没有 `upstream/`。

```text
packages/plugins/
├── package.json                      # 整包版本、依赖、公开入口
├── src/
│   ├── plugins/
│   │   ├── reasoning/
│   │   │   ├── upstream/             # 原始 assistant-ui 展示代码及其样式
│   │   │   ├── adapters/             # 产品/项目适配，Creator 优先修改
│   │   │   ├── styles/               # 产品自己的样式，不混改上游 CSS
│   │   │   ├── locales/              # 经统一 locale 层使用的插件文案
│   │   │   ├── assets/               # 插件专属资源
│   │   │   ├── definition.ts         # 完整 UI Plugin 定义
│   │   │   ├── index.ts              # 插件公开入口
│   │   │   ├── plugin.json           # ID、插件版本、入口、依赖/兼容要求
│   │   │   ├── UPSTREAM.json         # revision、文件来源、许可与摘要
│   │   │   └── CHANGELOG.md          # 插件自己的变更记录
│   │   ├── composer/                 # 同级完整插件目录
│   │   ├── tool-group/
│   │   └── web-search/
│   ├── shared/
│   │   ├── upstream/                 # 只维护一份的共享上游展示辅助实现
│   │   ├── adapters/                 # 共享产品适配
│   │   ├── theme/
│   │   └── locale/
│   └── catalog/                      # 目录类型/纯数据合同，不导入 Node 读取器
├── resources/                        # 原 Registry 的非插件资源，按需维护
│   ├── templates/
│   └── demos/
├── scripts/                          # 构建、来源校验、快照/目录生成
├── tests/
└── dist/                             # 生成物，不独立编辑
    ├── plugins/                      # 可运行插件与类型
    ├── shared/
    ├── sources/
    │   ├── plugins/                  # 与运行产物同源的可接管源码
    │   └── shared/
    ├── resources/                    # 经过筛选的模板/Demo 发布资产
    └── catalog.json                  # 整包插件/资源及快照索引
```

每个 `plugin.json` 是该插件元数据的单一维护源，`UPSTREAM.json` 记录上游来源，`CHANGELOG.md` 记录插件变化。`catalog.json` 由它们与构建结果生成，不手工维护第二套版本列表。当前资源使用 `manifest.json` / `changelog.json`；改名与格式转换属于待迁移合同，必须同步生成器/校验/历史解析，不能要求工程同时维护两套权威文件。

多个插件真正共享的展示代码放在 `shared/` 并声明归属和依赖；Core、Renderer、Runtime 及会话 Context 不搬进这里。源码快照若需重写导入以支持提取，只允许可追踪、经验证的机械转换。原始上游逻辑和产品适配仍分开。

用户工程始终存在应用层；同意接管后才增加实现源码。以下为目标结构，名称示意，迁移不能覆盖已有文件：

```text
<sourceRoot>/plugins/reasoning/
├── definition.ts                     # 本地注册/身份与当前实现声明绑定
├── index.tsx                         # 用户应用层：默认 npm import + JSX props/组合
└── source/                           # 同意接管后才生成；实现同步范围
    ├── upstream/                     # 若该插件有专属上游展示代码
    ├── adapters/                     # 官方实现适配层，接管后可定制
    └── ...                           # 实现 manifest、样式、locale、来源等闭包
<sourceRoot>/plugin-shared/            # 必要共享展示资源，独立声明单一所有者
<metadataRoot>/...                    # 实现所有权、准确 BASE、摘要和历史来源
```

所有权与 BASE 放工程元数据，不混入官方 `plugin.json` 或 AppUIModel。`sourceRoot`/`metadataRoot` 由现有项目路径配置解析；示意路径不要求固定顶层目录。快照/BASE 的实际保存格式及 source-lock 迁移另行实现。

## 3. 默认包实现、本地应用层与源码托管

官方插件仍由一个 `@za38.03/agent-ui-plugins` 包交付，提供可单独引用、具有完整类型的公开组件和组合入口；定义与元数据仍遵守 Plugin Contract。Core、Renderer、Runtime 继续为共享 npm 底座。生成工程自己安装所需 UI 依赖，不依赖 Creator 的 UI 技术栈。

目标运行链路：

```text
AppUIModel 的 pluginId 与布局/语义组合
  → 生成 Registry 中的本地 definition 加载入口
  → 用户应用层（默认只直接返回包组件）
      → 包引用模式：npm 公开组件
      → 源码托管模式：source/ 中相同公开契约的本地组件
```

Registry 在两种模式下均解析本地插件定义；来源切换发生在应用层的实现 import，不替换用户应用层。默认层仅返回包组件，需要传参时才增加 JSX 定制，不预先复制功能。Composer 的实际公开入口示例：

```tsx
import { ConversationComposerPlugin as Composer } from "@za38.03/agent-ui-plugins/composer";
import type { ComponentProps } from "react";

export function ComposerPlugin(props: ComponentProps<typeof Composer>) {
  return <Composer {...props} inputProps={{ submitMode: "ctrlEnter" }} />;
}
```

接管后仅把实现引用改为例如 `./source/adapters/composer`，保留函数内原有 props 和组合。组件 public API 必须区分已实现与待补齐；上游本来支持的 props、子组件、renderer、DOM 参数与事件不能因 npm 包装被无意收窄，类型与实际转发都要验证。封装遗漏应修补公开 API，不能当作要求用户接管源码的理由。不引入 AppUIModel configSchema 来替代这层 React 代码。

每个 pluginId 只有一个有效实现来源。项目应用层存在不代表已接管源码，也不是未经授权的同 ID 官方实现副本；生成器必须识别这种合法本地注册入口，避免既把包定义直接注册一次、又把包装定义注册一次。未接管时定义绑定包声明；接管后绑定本地实现 manifest、服务与能力声明，不继续从新包读取同 ID 实现合同。薄层不独立维护第二份官方 manifest。

Plugin ID、实例 ID、既有实例配置、语义 Slot 和服务契约在接管时保持稳定。同一 pluginId 的多个实例共享实现来源；计划列明受影响实例。来源和受管文件分类记录在工程元数据，不进入 AppUIModel。未确认的实现源码副本仍属于冲突；缺失已接管实现须报错，不能静默回退到 npm。应用层只使用公开 API，不复制 Runtime 或 Context。

界面可以继续只显示包版本、是否托管源码及更新状态；用户不必理解内部 upstream/adapters 划分。Creator/Operator、目录读取器和源码快照不进入生产浏览器模块图。

## 4. 何时询问，如何安全接管

Creator 先区分请求：位置、尺寸和语义组合修改 AppUIModel；组件参数、样式、渲染与交互先修改用户应用层，使用 props、children/子组件组合、renderer 和公开扩展 API。修改应用层不需要源码接管，也不因工程中出现插件文件就视为已接管。确认公开 API 无法满足、必须编辑实现后，Creator 才提出源码接管，先准备可审查计划：目标插件、当前包版本、提取文件和依赖范围、受影响实例、切换及后续更新方式，再询问用户。

“帮我调整插件”不自动等于同意源码托管。首次接管必须取得用户对该插件的明确同意；拒绝或未答复时保持包引用。已同意并成功接管的插件后续普通源码修改无需重复询问。该同意不授权接管其他插件、修改 vendor、删除未知文件或切回包引用；待执行计划过期或范围发生实质变化须重新说明并确认。

接管必须读取工程当前实际解析的 Plugins 包中的 catalog 和匹配源码，不能使用工具自身安装的较新包或 latest 代替。必要证据包括包身份/版本/产物完整性、插件版本、源码快照摘要及来源 revision。新 catalog 记录所属 Plugins 包版本，不再有一个独立发布的 Registry npm 版本；目录 Schema 版本仅标识数据格式。无法找到匹配快照时阻止接管，不反编译 dist、不复制残缺 node_modules、不猜测历史源码。

Operator 在用户同意后重验计划状态，只在实现子树提取完整展示闭包、记录原始 BASE 和来源、按语法定位切换应用层实现 import，并保持注册入口与原有 JSX 定制，生成派生文件并验证后提交；失败恢复原来源。不能先移除包引用再留下不可运行的半份源码，也不能把用户在工程随手放的同 ID 目录默认为已授权接管。

如果接管涉及新的 npm 依赖，计划必须列明 package.json/锁文件变化及恢复范围。现有源码事务不覆盖完整依赖安装，须补足后才能宣称接管端到端原子完成。

## 5. “完整源码”与共享依赖的边界

完整接管包括该插件专属展示实现、实现适配、实现合同声明、样式、locale 资源及必要辅助代码；用户的注册/应用层入口在此闭包之外。不允许仅复制入口，再让它调用原包中同一插件的整个实现或私有内部路径。可提取性必须是发布门禁，不是假定所有组件都已具备。

Core、Renderer、canonical Runtime、React Context 和稳定公共服务不复制到插件目录。多个插件共享的展示资源要明确采用稳定公开包 API，或提取成工程内单一受管 Source Item；禁止各自复制状态 Context 或 Runtime。提取共享源码时必须列明依赖与兼容要求，文件只有一个受管所有者。

升级 npm 包不会重写本地插件文件、改变其实现来源、切回包引用或推进其源码基线，但共享依赖、全局/公共样式和 Runtime 仍可能改变行为。不能承诺源码托管天然保证运行效果冻结。包升级计划应检查本地插件的兼容要求；不兼容时阻止工具自动升级，或列明必要的依赖/源码同步。用户在外部包管理器中自行升级无法由 Creator 拦截，后续检查应如实报告问题。

样式和 Portal/locale/主题接入需能与仍使用包实现的插件共存，验证没有重复 CSS、全局覆盖或组件隐式仍渲染旧包实现。插件不因被接管而创建第二套 Agent Runtime。

源码内部保留上游与产品/项目适配边界。Creator 在已接管状态下仍先尝试用户应用层 props/组合，再改实现适配层；原始 vendor 保持 unmodified、locale-agnostic 和来源可追踪，不把源码托管同意解释成 vendor 修改许可。检测到人工 vendor 修改时显示本地定制，更新不得无提示覆盖。产品文案继续使用统一 locale 层和 en-US/zh-CN 对等消息。

## 6. 版本与更新：一个总览，两种执行

整个产品通过统一更新中心提供“项目 Agent UI”和“Creator 开发工具”两类更新。六个包继续独立发布，Operator 随 Creator 发布，官方兼容清单维护可共同使用的精确版本；用户不需要自己决定依赖联动。项目包在选定 React 生产工程升级，Creator/Operator 在其工具安装位置升级并处理必要重启，不把工具放进应用生产依赖。Vue/HTML 仅通过 Web Component 嵌入，不增加原生 Vue 生成或业务工程改造。

| 身份 | 含义 |
| --- | --- |
| 兼容发行组合/清单 | 跨包的官方推荐精确版本与兼容要求；可含不同包版本，不是新 npm 总包或 Source Registry 版本 |
| npm 包版本 | 已安装/可安装的整个官方插件包版本；包内入口共用此安装版本 |
| 插件版本/变更记录 | 官方元数据标识该插件源码的变化，服务于展示和源码同步，不是独立 npm 安装版本 |
| 目录/源码快照身份 | 同一个 Plugins 包版本下的 catalog、快照摘要与格式版本，不是另一份可独立升级的 Registry 包 |
| 本地插件基线 | 上次接管/完整同步采用的官方插件、包版本、源码快照与文件摘要 |

用户查看整个包的更新总览。未接管插件随包升级获得该版本实现，不能宣称同包 npm 插件能各自选择不同安装版本。已接管插件显示“本地托管，官方有更新”，继续使用当前本地实现。升级包会获得新的运行产物和目录/源码材料，但不得自动同步本地源码；不再提供“先升级独立 Registry 包”的操作。

发现更新只读，默认显示当前到推荐兼容目标的累计功能变化、依赖联动与破坏性要求，逐版本记录展开查看。例如 1.0.0 → 1.0.8 汇总整个区间，正常情况下直接升级目标，不要求用户逐补丁确认。资料或网络缺失须明确显示未知/缓存状态，不遗漏默认 npm 插件或冒充“没有更新”。

用户确认具体升级计划后，Creator 交由 Operator 更新批准范围内的依赖声明、通过工程现有包管理器实际安装、更新锁文件并验证实际解析版本和工程。版本由真实包身份和官方清单产生，不能写死或由模型推测。只修改 package.json 不算升级完成；安装失败恢复与源码事务分开设计，不能承诺只还原 JSON 就恢复所有依赖。工具升级和项目升级、npm 完成和源码合并完成分别记录。

例如包从 1.0.0 升至 1.1.0：包引用的 Composer 使用 1.1.0 中的实现；已接管的 Reasoning 保留来自 1.0.0 的官方基线和本地定制。Registry 可显示 1.1.0 的 Reasoning 变化，但只有用户要求同步后才改本地文件；共享依赖兼容仍须检查。这里的版本仅为示例，不是当前已发布版本。

用户要求 Creator 同步某个本地插件的新功能后，工具以选定官方包版本对应的源码快照生成计划，列出变化与必要依赖。Registry 只提供官方 BASE/TARGET；LOCAL 来自工程，不将用户定制上传成官方资源。首次 BASE 就是接管时的准确官方快照，不能在之后包升级时改写。

统一流程在 npm 安装和验证后，根据实际已安装的 Plugins catalog 重新计算可选源码同步；在线较新版本只提供升级前的信息，不能跳过安装身份直接作为 TARGET。用户可暂不合并；升级包的确认不等于新的源码接管、源码合并或采用 BASE 的同意。具体兼容清单、计划/恢复合同及实施位置以 [统一更新中心设计](unified-update-center.md) 为准。

完整版本同步只在实现受管范围内使用三方合并：BASE 是上次采用的精确官方实现源码，LOCAL 是当前工程的本地实现源码，TARGET 是选定新版官方实现源码。用户应用层（含其注册入口、props、组合、renderer 和定制）不属于三者，不进入合并、新增/删除或模板重生成范围。必要共享 Source Item 也须声明独立归属，不能扩大为整个 plugins 目录合并。

无论 npm 升级还是源码同步，用户应用层字节都应保持不变；若新版公开 API 与它不兼容，报告具体位置并单独处理应用层适配，不在源码同步事务中顺带重写。该项目代码修改与实现合并分开展示、验证，不伪装成官方 BASE 更新。冲突、文件新增/删除、路径占用及 vendor 修改须可审查；缺少或不一致的历史 BASE 时阻止自动合并，不用 latest 或 LOCAL 冒充 BASE。

如果用户只要某个新版特性，Creator 可以提出定向移植，但不得把只吸收部分变更的结果标记为已完整升级到 TARGET，也不得据此把整份 BASE 推进为 TARGET。此类修改保留旧官方基线，作为 LOCAL 定制；后续完整同步仍与真实 BASE 比较。若将来增加细粒度合入记录，须另行设计合同。

模型编辑完毕不等于升级完成。Host 重新生成注册表、检查依赖、类型/相关测试及构建，用户审查采用后才推进官方基线。保留本地修改是合法结果，不能要求 LOCAL 与 TARGET 字节相等。结构检查不保证全部变更语义已合入。

沿用现有合并机制：手动/模型编辑发生在采用基线事务之前；采用失败会恢复该事务内的源码、锁和派生产物，并保留采用前的合并编辑供重试，不能宣称回到编辑前状态。若需要从提案到合并均可整体回退，需另行实现暂存工作区。

切回包引用是另一项显式迁移，不是包升级的副作用；须展示将停用的本地定制、版本兼容和保留/清理范围。未获授权不删除本地文件、不迁移其他插件。首次版本可先不提供切回功能。

## 7. 元数据与历史基线

拟议元数据需覆盖：实现来源、插件 ID、包公开入口及准确解析版本、插件版本、catalog Schema 与源码快照摘要、文件摘要与归属、上游来源/许可证、共享依赖兼容要求、本地入口和上次采用的官方基线。授权由工具 Host 校验并绑定具体计划，不以源码里的布尔字段替代用户同意。

以上是待实现合同，不代表现有 Schema 已支持这些字段。现有 source-lock、`requires`、`packages`、`upstream`、Release 和 changelog 可以复用，但需要版本兼容/迁移设计。npm lockfile 不是本地插件的源码 BASE，hash 本身也不能恢复内容。

发布时从同一官方实现构建 npm 产物与不可变源码快照，验证文件闭包、转换规则、摘要、版本映射、许可证和历史可恢复性，避免包修了而快照没修。不同源码交付格式允许机械重写公开导入，但须记录/测试转换，不能独立维护另一份手改实现。接管时须保留可恢复 BASE；历史查询可以读取精确旧 Plugins 包归档或正式缓存，但不能仅依赖会被包升级替换的当前 node_modules 内容。归档获取/保存方式仍需实现，缺失历史明确失败，不回退测试 fixtures。

旧 source-lock 的 `sourceRelease` 与独立 Registry 历史不可重新解释为同号的 Plugins 包版本。迁移必须保留旧来源包身份、Release、摘要和历史解析能力，再建立新 catalog/快照身份；不同来源命名空间不能只靠 SemVer 数字比较。退役旧发布包不等于删除旧工程恢复 BASE 所需档案。

## 8. 迁移前基线与后续工作清单

统一更新中心的后续任务以 [具体实施位置与验收](unified-update-center.md#7-当前差距与实施位置) 为准：真实版本来源、在线兼容发行 Provider、累计变更、默认 npm 条目展示、确认计划、真实依赖安装/恢复、工具重启以及安装后源码同步。下方保留的是既有插件交付迁移清单，不表示这些新增更新能力已存在。

薄应用层试点与后续工作：

- Plugins：补齐逐插件公开组件和组合出口、完整 props 类型与运行转发；包运行产物与接管快照保持同源公开契约。
- Operator / Bootstrap / 模板：默认生成本地薄应用层与注册入口；Registry 始终指向它，区分应用层与实现所有权，保留重复实现检查。旧工程先识别已有本地定制，不通过重新生成模板覆盖。
- Creator prompts / skills / tools：明确布局走 JSON，组件定制优先应用层；只有实现需求才询问接管；已接管后仍保持同样优先级，不做成固定问答工作流。
- 接管计划与事务：快照文件只落在 `source/` 实现闭包，机械切换 import 并保留应用层内容；应用层变更也进入计划并做过期校验，失败恢复原 import。
- ownership / 更新引擎：区分 application/implementation/shared 文件归属，BASE/LOCAL/TARGET 排除应用层，兼容诊断与应用层适配单独处理。
- 验证：无定制默认直用 npm；props/组合修改零接管；无法满足才真实询问；拒绝零实现提取；同意后保留 props、ID、实例与 Slot；npm 升级和源码合并前后应用层字节不变。

下表保留更早合包迁移前的基线，不表示这些旧问题当前仍全部存在。

| 工作面 | 当前事实 | 调整目标与主要位置 |
| --- | --- | --- |
| 包边界与依赖 | 目前独立 Source Registry 仍在 workspace/publicModules，Operator 依赖它 | 将资源、纯数据合同和发布资产合入 Plugins；调整包清单、构建顺序、依赖与引用后退役 `packages/source-registry`；不把 Node 读写和更新引擎并入运行入口 |
| 官方实现权威 | Plugins 拥有组件/vendor；Composer 构建从 Registry 参考源码取实现 | `packages/plugins/src/plugins/<id>/{upstream,adapters}` 与 `shared/` 承载单一实现；调整 `build-composer.mjs` 与上游同步脚本，不再从旧 Registry 获取实现 |
| 默认包插件目录 | `source-registry/src/package-plugins.ts` 目前只登记 Composer 及旧名；其他多为源码插件 | 将目录与定义索引迁到 Plugins 内并由单一元数据生成，补齐默认包入口；Operator 消费包内目录，默认不复制实现；Demo/业务自定义不强制变成官方包插件 |
| 精确源码目录 | Registry 有源码资源/版本，没有通用的生产包版本→完整插件快照合同 | 旧 `source-registry/src/{types,schema,release,package-plugins}.ts` 的纯目录合同迁到 Plugins `src/catalog/`；新生成 `dist/catalog.json` 与 `dist/sources/`，覆盖闭包、编辑分类、来源和历史完整性 |
| 来源解析与注册 | Operator 的官方 ID 保护和包插件分支不允许通用同 ID 本地接管 | `project/{plugin-assets,registry-generator,types,service-dependency-inspector}.ts`：显式 ownership 解析，只有已确认并成功登记的本地实现覆盖包定义；未知同 ID 仍报冲突；所有实例唯一实现 |
| 接管执行 | `migrate-official-package-plugin.ts` 当前是源码→包；无完整通用包→本地事务 | 增加接管计划/执行/验证/回滚，调整 `install-official-agent-ui-resource.ts`、`source-registry/{installer,package-dependencies,project-mutation,lock,types}.ts`；不反转旧函数，不让重装将已托管源码迁回包 |
| Creator 权限与确认 | authoring catalog 和 Python 工具仍将官方插件视为 dependency-owned | `creator-authoring-target-catalog.ts`、`create-custom-plugin.ts`、Creator Python prompts/tools/admission、`skills/ui-plugin-development`：识别可接管状态，先计划再询问，授权后切换，托管后适配优先；新建同 ID 文件不能绕过确认 |
| 本地源码同步 | `AgentUIUpdateService` 已有逐插件计划、BASE/LOCAL/TARGET、采用基线验证 | `project/source-registry/updates.ts`、`update-contract.ts`、`source-registry/src/release.ts`：面向已托管插件，保留接管 BASE，按包版本解析 TARGET，处理完整同步与特性移植区别 |
| Node 工具与历史 | 旧 Registry 的 loader/release 使用 fs、path、crypto；历史需显式 `historyRoot` | 迁移文件读取、归档校验和历史 Provider 到 Operator 开发模块，读取目标工程精确 Plugins 包的目录资产；接管保存 BASE，旧历史独立解析；尚无默认网络历史服务 |
| 非插件资源 | 旧 Registry 还含 foundation/integration/Demo 及实验资源 | 合入 Plugins `resources/` 和筛选后的 `dist/resources/`；Bootstrap 编排归 Operator，Mock 归 Creator，稳定框架实现的 npm 归属单独迁移；保留 A2UI 排除 |
| 统一更新页面 | Creator 已有源码插件版本、changelog、计划和合并 UI | `creator/src/ui/CreatorPluginUpdates.tsx`、Host API：整个包更新总览中区分包引用与本地托管，说明包更新影响、兼容阻塞和可选源码同步；不自动合并本地源码 |
| 生产包与资源验证 | 发布清单与测试断言独立 Registry/八包，旧门禁禁止 vendor 目标 | 合并 release/distribution/notice 检查到 Plugins 构建；调整 `scripts/{build-public-packages,verify-public-packages,package-ownership.test}.mjs` 和消费者测试，验证单 tarball 的运行入口、完整来源快照、无 Node 工具浏览器泄漏及 A2UI 排除 |
| 共享底座与上下文 | Runtime 依赖 Plugins 部分上下文/展示能力；foundation 还下发部分框架实现 | 逐项划清稳定 npm API 和可提取展示闭包，禁止复制 Runtime/Context；稳定框架归属单独迁移，不在本轮搬代码 |
| 模板、样式与 i18n | Host、Bootstrap 和源码模板已有包/源码混合引用 | Operator presets、Host examples、上游/i18n 文档：新工程默认包入口，接管计划切换必要引用和样式扫描，检查 locale/Portal/主题/样式共存 |

合包阶段已移除独立 Registry 发布项、迁移资源/API 消费者并更新依赖、类型声明和打包验证；未发布 npm 或改变现有包版本。上表描述迁移前基线及完整接管目标，不能理解为所有后续工作已完成。

旧源码工程保留现有定制和基线，不能初始化/重装就自动迁成包引用；旧包工程默认继续使用包。原 Registry 公开 API 的调用方须逐项迁到 Plugins 的目录数据入口或 Operator 工具 API，旧包的兼容/停止发布策略另行执行，历史档案不得随包清理丢失。兼容别名不代表新的插件能力。

## 9. 实施顺序与验收

以下为既有合包与接管阶段的顺序记录；后续先完成第 8 节薄应用层/API 工作，再以新的分层验收接管与同步。既有试点通过不代表新应用层目标已实现。

1. 先定义包内 catalog/快照、单一插件元数据、ownership/授权计划和兼容合同；清点旧 Registry 的资源/API/测试/许可证/历史来源，确定迁移映射并保持旧锁可读。
2. 用 Composer 或 Reasoning 一个插件完成默认包引用→准备计划→用户拒绝/同意→完整源码提取→引用切换的闭环；实际依赖闭包决定试点范围，不宣称当前试点已完成。
3. 验证本地定制后升级整个包：未托管插件采用新版，本地文件、引用来源和 BASE 保持不变；若共享依赖不兼容，明确阻止工具自动升级。
4. 验证用户要求同步新版：三方合并、冲突处理、审查采用、下一次使用新 BASE；特性移植不误推进完整版本。
5. 扩展其他官方插件及统一更新 UI，迁移非插件资源、Node 工具、所有导入与打包测试；验证后移除独立 Registry 发布项和 Operator 对旧包的依赖。统一 Plugins 包同时拥有运行与源码资产，不默认接管全部插件；切回流程可后续完善。

薄应用层还须覆盖：默认本地定义只注册一次；公开 props/子组件类型与运行行为一致；封装遗漏不触发接管；接管只切换 import 且保留应用层定制；包升级、源码合并及文件删除不触碰应用层；API 不兼容独立报告，失败不推进实现 BASE。

必须覆盖：Plugins 单 tarball 内运行入口与源码快照精确匹配、无独立 Registry 安装要求、Node 工具及源码资产不进入浏览器模块图、原非插件资源和旧历史可读取；未同意零接管写入；同意范围/计划过期；准确已装版本而非 latest；残缺快照、路径占用、同 ID 重复注册；全实例配置/Slot/服务不变；专属源码完整且不依赖私有包路径；共享 CSS/locale/Portal 与包插件共存；历史 BASE 缺失/不一致；文件新增/删除冲突；采用失败不推进基线；接管失败恢复包来源；依赖安装恢复边界；去掉开发工具后工程仍独立 typecheck/test/build；始终只有一套 canonical Runtime。

Windows 必须支持。逻辑路径/manifest/归属比较使用规范化 POSIX 路径，实际读写使用 native path，URL 用 fileURLToPath/pathToFileURL，进程用现有 pnpm helper。覆盖 path.win32、空格/Unicode、大小写冲突、CRLF 校验策略以及打开文件时的切换/恢复。不得为掩盖 vendor 差异静默重写历史字节。macOS 静态检查不代表真实 Windows 验收。

## 10. 不变的产品边界

Core、Renderer、Runtime 是共享底座。Host Provider、宿主动作和状态/事件订阅仍由 Runtime 拥有；项目只绑定 AppUIModel、插件注册、Frontend Tools 与会话持久化配置。不复制消息状态、AG-UI 映射或中断恢复逻辑。

检查上游仍使用本地 `/Users/yifei/Coding/assistant-ui` 的 pinned revision。原始上游和许可证保持可追踪；产品 locale 通过适配层实现，缺口记录到 i18n gaps。无需为此决策重新研究或改变上游行为。

A2UI 继续暂缓，不因新增接管通道开放安装、公开 API 或 Mock 示例。普通 JSON Generative UI 不受影响。开发工具包、源码目录存在和历史验证记录都不是新机制已完成的证据。

## 会话列表与独立新建入口（2026-10-21）

`conversation-thread-list` 负责列表和可选搜索，通过可选的 `headerActions` 语义槽接收独立操作插件；它不内置新建按钮，也不注册新建会话的 RailAction。应用层通过 `listProps.showSearch`（默认 true）控制搜索；关闭搜索时不保留隐藏查询对列表的过滤。原先公开的 RailAction 组件保留为兼容导出，但默认列表定义不挂载它。

`conversation-new` 是独立插件，两份默认模板都显式声明一个实例，调用同一个 canonical Conversation Runtime。应用层通过 `showLabel`（默认 true）配置图标与文字；Assistant/Embedded 的初始化应用层传入 false，以图标按钮呈现，保留本地化无障碍名称和 Tooltip。Platform 默认通过列表的可选语义子槽 `headerActions`，把同一个独立新建插件实例放在侧栏标题下方、搜索框上方。列表不内置新建按钮；该槽由 AppUIModel 显式组合，Platform 的薄应用层把槽内容传入公开的 `headerActions` prop；实现组件不主动读取新槽，避免已有应用的旧 manifest 因未声明该槽而报错。未配置时不显示操作区域。列表是否参与组合、新建入口的位置由 AppUIModel 决定；搜索开关和文字呈现留在项目应用层 JSX。既有项目的应用层保留，默认模板只影响后续初始化。上游 primitives、vendor 源码与 provenance 不变。

## 语言切换插件（2026-10-21）

`locale-switch` 是独立可见 UI Plugin，默认模板的 app-ui.json 不声明该插件；应用需要时通过 Layout Slot 添加。`locale-provider` 继续唯一持有语言服务；薄应用层注入 `agent-ui.locale`，展示实现只订阅服务并调用 setLocale，沿用 accessibility 文案域。提供 root/select props 和 children，默认支持 zh-CN/en-US。npm 子路径、可提取实现和资源目录均从同一 canonical owner 生成，不修改 upstream。

生成 Agent 的 `onLocaleChange` 向受控 Host 报告服务中的语言变化；示例 Host 用此回调同步页面文案，移除原来的 Host LocalePicker。未传 locale 的工程继续由语言服务驱动；传入固定 locale 的 Host 保留受控行为。
