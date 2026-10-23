# 对外文档信息架构与逐篇写作计划

状态：现有 138 篇面向用户的文章已完成目录审查与归属整理，截图仅保留需求说明。按用户补充要求，删除对外 Operator/Bootstrap 内部 API 章节，以检查结果参考替代；接入和定制只保留完成用户操作所需内容。
盘点日期：2026-10-22。
范围：当前仓库对外使用入口、生成的 Agent 前端、官方 Plugin、接入/扩展 API 与维护流程。
规模：8 个顶层主题目录，138 篇文章（含 39 篇界面 Plugin 专页与开发、配置说明）；网站首页另计。所有文章已接入所属侧栏。

## 1. 盘点依据与可信边界

本次检查了 npm exports、CLI 参数、Creator 设置/初始化/对话/回执/命令界面、Mock 场景注册、Plugin delivery recipe、预设、公开 Host/Runtime API 和相关架构文档。属于静态源码及文档核对，没有重新做全功能浏览器或真实后端验收。

- 官方 Plugin 当前以 `packages/plugins/src/catalog/plugin-delivery.json` 为清单来源：44 个唯一 ID。不能使用历史文档中的 43/63 或旧别名作为当前数量。
- 目录中列出某能力，表示必须解释其使用方法、前提或限制；不等于已对该能力完成发布验收。
- 用户文档只使用已实现、实际可达的入口。设计文档的历史阶段与目标不能覆盖当前实现；正文编写时必须重新核验。
- 不把仓库 `pnpm dev` / `apps/creator-workbench` 当作安装 npm 包用户的必经路线。仓库开发说明仅放高级附录或贡献文档。
- 网站维护最新版；“自某版本支持”必须注明具体包名并追溯实际发布证据。目前版本/历史不足时写“待核实”，不能推算首发版本。
- “可选”“需宿主接入”“需要 Agent 数据”“当前不可执行”与“默认启用”必须分开标注。44 个 Plugin 不代表每个预设默认启用全部。

## 2. 读者、导航与文件位置

读者分为：A 使用 Creator 的人；B 使用生成应用的人；C 接入/部署的宿主开发者；D 手写 Plugin 或定制实现的开发者；E 维护和排障人员。

顶栏保留五组入口，避免把所有主题并排摆出：

| 顶栏入口 | 内容目录 |
| --- | --- |
| 开始使用 | `start/` |
| 使用指南 | `guide/`（Creator 开发与 Mock 联调）、`agent-ui/`（生成应用） |
| Plugins | `plugins/`（逐 Plugin 展示与使用） |
| 接入与定制 | `integration/`、`customization/` |
| 帮助与维护 | `updates/`（含版本支持与发布记录）、`troubleshooting/` |

```text
website/
├── docs/
│   ├── index.mdx                 # 产品首页，不承担完整教程
│   ├── start/
│   ├── guide/                    # 沿用已有 Creator 用户手册路径
│   │   └── mock/                 # Mock Agent 使用与调试
│   ├── agent-ui/
│   ├── plugins/                  # 界面 Plugin 专页与插件开发
│   ├── integration/
│   ├── customization/
│   ├── updates/
│   ├── troubleshooting/
│   └── public/images/            # 按文章归档真实截图
└── demos/                        # 后续可运行示例源；不复制产品实现
```

下文路径均相对于 `website/docs/`。普通文章采用 `.md`，需要交互示例时改成 `.mdx`，同一路径不能同时保留两种后缀。当前占位页在写对应正文时替换。初次规划不创建空页；当前正文已经完成并接入站点导航。

独立「开发参考」菜单已撤下，12 篇参考文章全部归入相应主题：Creator 命令、配置和结果状态归工具手册；包入口、应用 API 与 AG-UI 契约归应用接入；布局与可选实现归定制；Plugin 定义归插件开发。

2026-10-23 全站复查：按用户任务明确教程、能力、插件、应用接入、定制、更新与排障边界；所有文章保留直接侧栏入口。具体问题、归属调整和验证见[目录审查记录](./public-documentation-structure-review.md)。

## 3. 已识别的用户能力及归属

| 对外能力 | 主要文章归属 | 核对位置 |
| --- | --- | --- |
| 安装、首次启动、Python 环境、模型配置 | start、guide/model-configuration、guide/configuration | Creator README、CLI、advanced 配置说明 |
| 工程选择、三形态、源码位置、初始化与异常工程 | start、guide/project-selection | workspace/types、CreatorProjectSetup、presets |
| 对话咨询、检查、改 UI、澄清确认、停止、回执、撤销/重做 | guide | CreatorWorkbench、QuestionCard、receiptTypes |
| Creator /theme、/install、/sync | guide/commands | commands/registry、types、command-api |
| Mock/真实服务切换、直连与转发 | guide/mock、integration/connect-agent | AgentConnectionPanel、agent-connection |
| 内置场景、资源要求、回放速度、本地 JSONL | guide/mock | MockServicePanel、mock-agent、local-recording-store |
| 包版本发现、兼容性、升级计划/安装/恢复 | updates | CreatorPluginUpdates、PackageUpdatesOverview、Operator 更新实现 |
| 薄层定制、接管、差异合并、验证、BASE 采用 | customization、updates/source-sync | plugin-delivery recipe、source ownership、Operator source-registry |
| 用户消息、流式回复、编辑/重试、引用、附件、语音、队列 | agent-ui、plugins、customization | Plugins public API、Runtime public API、具体应用层 |
| 思考、工具、审批、任务/计划、结构化结果和检索 | agent-ui、plugins、integration/ag-ui-contracts | delivery recipe、renderer、Runtime 兼容投影 |
| 历史、线程切换、恢复与取消 | agent-ui、integration/history-backend、integration/runtime-api | thread binding、Host API、conversation services |
| 身份、账号、认证门禁、主题、语言 | plugins、integration、customization | auth/theme/locale Plugin、Host user/API |
| React Host 控制、Vue/HTML Web Component、producer 更新 | integration | CreatorProjectIntegrationGuide、AgentUIProvider、Web Component README |
| AppUIModel/Layout/Slot、自定义 Plugin、生命周期/服务 | customization、plugins | Core、Renderer、Plugin contracts、生成模板 |
| 前端工具、共享状态、应用事件、工具/数据 renderer | customization、plugins | Runtime public、frontend-tool lifecycle、Plugins public |
| 可选 Generative UI、Lexical 和表单工具出口 | customization、plugins | 精确公开出口；必须再做可运行样例验收 |
| 独立生产构建、内网与 Windows、移除工具 | integration、troubleshooting | 项目独立脚本、工具适配器、生成构建资源 |
| Creator CLI、配置、Mock 场景入口 | guide、guide/mock | CLI 与实际公开入口；不把内部 API 单独列为用户任务 |

## 4. 逐篇目录与写作范围

优先级：P0 首轮使用所必需；P1 常用及完整产品能力；P2 精确 API 与高级扩展。优先级不代表缺少功能可以省略文档。

### start/ — 开始使用

首版按用户确认采用手动配置主线，最后补充 AI 辅助（`start/ai-assisted.md`）。实测工程为 `cmb-service-workbench`，React/React DOM 保持 19.3.1、Ant Design 保持 6.6.7；工作台模板手动引入 `Agent` 并无缝铺满业务主内容区。步骤与截图见 `website/docs/start/`。

面向：产品评估者、首次接入者。默认写作批次：P0。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `start/index.md` | 开始使用 | 从安装 Creator 开始，在用户自己的工程中完成创建、接入和首轮对话；文字配合实际操作截图，不讲解文件管理器、终端等基础操作。 | 按步骤对应的操作截图 |
| `start/read-documentation.md` | 阅读网站和 AI 文档 | 本地搜索、目录、每页 .md、llms 索引、本地文件和知识库读取；明确 Creator 专门文档工具尚未接入。 | 文档页入口与离线目录 |
| `start/install-creator.md` | 安装与启动 Creator | 环境要求以提示呈现，不设独立检查步骤或文章；安装开发依赖、启动脚本和页面入口配置。 | 配置代码、入口截图 |
| `start/first-agent-ui.md` | 创建第一个 Agent 前端 | 选工程、产品形态、源码位置、初始化、使用 Mock 完成首轮对话；React/Vue 路线链接到对应教程。 | 完整操作截图 |
| `start/project-modes.md` | 选择平台式、悬浮式或嵌入式界面 | 三种产品模式的使用场景、容器约束与初始化结果；默认 Plugin 以实际 preset 为准。 | 三形态并列截图 |
| `start/generated-files.md` | 认识生成的工程与文件 | 薄应用层、Plugin 定义、AppUIModel、服务、生成注册表、.agent-ui 元数据和构建产物；哪些文件可改。 | 带注释目录树 |
| `start/ai-assisted.md` | 用 AI 修改界面 | 手动接入之后的可选 AI 辅助：模型配置、需求输入、确认与查看修改；与目标 Agent 连接分开。 | Creator 输入框与结果验证 |

核对入口：`packages/creator/README.md`、`packages/operator/src/ui/setup/CreatorProjectSetup.tsx`、`packages/operator/control/presets/{assistant,platform,embedded}/app-ui.json`、`packages/{core,renderer,runtime,plugins,web-component,creator}/package.json`。

### guide/ — 使用 Creator

面向：使用 Creator 修改前端的人。默认写作批次：P0。

Creator 按启动配置、工程任务、结果会话、模拟联调组织；所有侧栏统一为一层主题分组加详细文章，不再嵌套分组。通用诊断归故障排查。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `guide/index.md` | 界面开发 | 以准备环境、描述需求并实施、验证效果组织开发主线；工程管理、会话和回执等通过上下文链接深入。 | 开发面板与修改结果 |
| `guide/project-selection.md` | 打开、切换与关闭工程 | 目录选择、身份隔离、未初始化/可用/损坏状态、刷新工程；关闭保留文件，确认待处理时切换限制。 | 工程状态截图 |
| `guide/model-configuration.md` | 配置 Creator 使用的模型 | .env.agentui.local、config-root、模型地址/名称/密钥、输出和请求超时配置；与目标 Agent endpoint 区分。 | 脱敏配置、错误状态 |
| `guide/ask-and-inspect.md` | 提问、检查工程与先做方案 | 只问用法、只读检查、请求方案与请求修改的区别；说明明确不修改时的行为和上下文使用方式。 | 对话截图 |
| `guide/request-changes.md` | 通过对话修改界面 | 用布局、样式、文案、Plugin 组合等真实请求组织教程；说明结果文件和验证，不把 Creator 描述成固定流程。 | 修改前后对照 |
| `guide/confirmations.md` | 回答澄清与确认变更 | 问题卡片、选项/文本回复、取消、过期上下文；普通修改确认、源码接管和更新授权各自范围。 | 不同确认卡片 |
| `guide/progress-and-cancel.md` | 查看执行进度与停止任务 | 运行中状态、工具活动、耗时任务、取消和中断；不承诺固定调用次数或停止就自动回滚。 | 运行中/停止后截图 |
| `guide/receipts-and-validation.md` | 理解修改结果与验证回执 | 文件差异、静态检查、运行验证、失败/未验证/无变更；区分构建成功和真实视觉验收。 | 典型回执截图 |
| `guide/undo-redo.md` | 撤销与重新应用修改 | 事务回执入口、可撤销范围、冲突和额外修改的保护；不混同 Git 回退或依赖恢复。 | 撤销/重做状态 |
| `guide/conversation-lifecycle.md` | 管理 Creator 会话 | 继续上下文、清空会话、浏览器会话保存边界；区分 Creator 对话与生成应用的用户聊天记录。 | 会话操作截图 |
| `guide/commands.md` | Creator 快捷命令 | /theme、/install、/sync 的菜单、参数、禁用状态和结果；明确 /sync 是注册表同步，不是源码升级。 | 命令菜单与回执 |
| `guide/preview-and-integration.md` | 查看预览与接入指引 | 目标页面开发服务、预览刷新、查看接入方法、Vue producer 构建并更新宿主；Creator 不负责业务服务生命周期。 | 预览及构建入口 |
| `guide/settings-and-language.md` | Creator 设置与界面语言 | 连接 Agent、演示回放、更新入口和 Creator locale；与生成应用主题/语言分开说明。 | 设置入口图 |
| `guide/creator-dock-vite.md` | 在 Vite 页面接入 Creator | 开发插件、独立启动脚本、端口、工程身份、可选加载与卸载；生产不读取工具配置。 | Vite 配置与启停 |
| `guide/creator-dock-rsbuild-webpack.md` | 在 Rsbuild 或 Webpack 页面接入 Creator | 分别列真实接入方式、HTML 注入范围、启动顺序、Node API dev-server 选项和适配限制。 | 两套独立最小配置 |
| `guide/creator-standalone.md` | 独立运行 Creator | CLI 独立页、server/ui/vite/host-preview 的选用；高级集成选项放在 Creator 工具接入说明，不要求普通用户自组装。 | 启动拓扑 |
| `guide/windows-and-offline.md` | Windows 与内网开发环境 | Creator 的 Windows 路径、平台组件、内网 registry/证书、离线工具依赖与模型访问；生成应用部署另见生产部署页。 | 平台与联网阶段矩阵 |
| `guide/cli.md` | Creator CLI 参数 | --project/-p、--config-root/-c、--message/-m、--port、--no-open、--help/-h；默认值、退出与错误。 | 参数表 |
| `guide/configuration.md` | 配置文件与环境变量 | 配置 Host/目标工程、服务端/开发公开字段、模型/Python/端口/诊断配置的读取顺序与生效时机。 | 逐字段表，全部核验来源 |
| `guide/creator-integration-api.md` | Creator 开发环境接入选项 | CLI、Vite、Rsbuild、Webpack 的用户选择与必要配置，不讲内部进程或执行 API。 | 实际入口与启停效果 |
| `guide/validation-results.md` | 检查结果与错误状态 | 用户可见回执、未修改/已修改/静态通过/运行未确认等结果，下一步与脱敏材料。 | 实际回执状态对照 |

核对入口：`packages/operator/src/ui/CreatorWorkbench.tsx`、`packages/operator/src/ui/CreatorQuestionCard.tsx`、`packages/operator/src/commands/{registry,types,command-api}.ts`、`packages/creator/docs/advanced.md`。

### agent-ui/ — 使用 Agent 前端

面向：评估生成前端能力的开发者，以及生成应用的最终使用者。默认写作批次：P1。

以「前端能力概览」为入口，侧栏按「对话交互」「执行过程」「结果与体验」分组，保留全部详细页面。概览从成品体验说明支持范围及插件、宿主和后端前提，简述 AG-UI 的事件连接作用；详细页面继续提供实际操作说明，不把协议接通等同于能力全部可用。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `agent-ui/index.md` | 前端能力概览 | 对话输入、执行过程与用户参与、结构化结果和应用体验的能力范围与接入前提；简述 AG-UI 的作用，不承诺全部默认启用。 | 按能力展示真实界面与交互 |
| `agent-ui/messages.md` | 发送消息与阅读回复 | 发送、流式内容、Markdown、多条 assistant 消息形成一次响应、等待/错误状态。 | 流式与富文本示例 |
| `agent-ui/stop-retry-edit.md` | 停止、重新生成与编辑消息 | 取消当前运行、重新生成、编辑用户消息和分支选择；写作前核验所选应用层实际提供的入口。 | 运行/编辑/分支演示 |
| `agent-ui/history.md` | 新建、查找与切换会话 | 新建、历史列表、搜索、读取/删除、加载失败重试；区分只读历史与可恢复会话的条件。 | 历史列表与状态 |
| `agent-ui/run-lifecycle.md` | 运行状态、排队与恢复 | 运行/等待输入/取消/失败、可选消息队列、刷新后恢复及线程切换；恢复依赖实际后端契约。 | 状态流转与恢复演示 |
| `agent-ui/input-features.md` | 附件、语音、引用与快捷输入 | 附件选择/移除、语音开始/停止、引用预览、@ 和 / 菜单；注明浏览器权限和宿主数据来源前提。 | 多种输入演示 |
| `agent-ui/reasoning-and-tools.md` | 阅读思考、工具与任务进度 | 等待提示、推理展开、工具组/时间线、状态/计划/任务组；明确显示取决于收到的数据与启用 Plugin。 | 分阶段交互演示 |
| `agent-ui/approval-and-questions.md` | 回答问题与处理审批 | 审批允许/拒绝、表单或选项问题、等待输入、恢复后的结果；提示真实业务权限由宿主/Agent 决定。 | 问题与审批演示 |
| `agent-ui/results-and-actions.md` | 引用来源、文件、图表与回复操作 | 来源、检索、文件结果和图表；复制、反馈、导出 Markdown 的作用范围与失败反馈。 | 结果卡片与动作 |
| `agent-ui/appearance-and-account.md` | 语言、主题与账号入口 | 中英文、主题、Agent 身份、登录门禁和账号操作；只讲接入后真实行为，不宣称提供账号后端。 | 主题/语言/账号状态 |

核对入口：`packages/plugins/src/public.tsx`、`packages/runtime/src/public.tsx`、`packages/runtime/src/threads/types.ts`、`packages/plugins/src/plugins/*/adapters/presentation/`。

### plugins/ — Plugin 展示与使用

面向：选择 Plugin、定制界面和手写集成的用户。P0 先写总览和核心会话组合；其余 P1 按使用场景推进。每个 ID 都有独立文章入口，服务型 Plugin 以联动示例替代“空组件截图”。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `plugins/index.md` | Plugin 总览与选用 | 按场景/类型/依赖/默认预设筛选，解释 UI、headless 服务和命名 renderer；链接 44 个准确 ID。 | 分类清单及组合依赖图 |
| `plugins/composer.mdx` | 输入框与操作组合（`composer`） | 输入、草稿、输入与动作 Slots、附件/队列等实际能力；默认 textarea 与可选 Lexical。 | 空闲/输入/发送中/队列演示 |
| `plugins/copy-action.mdx` | 复制回复（`copy-action`） | 完整响应的复制范围、可用/禁用/复制结果；公开 DOM/事件和文案接口。 | 完整响应复制 |
| `plugins/reload-action.mdx` | 重新生成回复（`reload-action`） | 当前响应和分支范围、运行保护、事件覆盖；真实后端重新运行前提。 | 重新生成与禁用 |
| `plugins/feedback-actions.mdx` | 回复反馈（`feedback-actions`） | 赞/踩、状态与反馈适配器；显示按钮不等于已有反馈存储服务。 | 反馈替身适配器 |
| `plugins/export-markdown-action.mdx` | 导出 Markdown（`export-markdown-action`） | 更多菜单、完整响应导出、文件与菜单定制、浏览器能力限制。 | 多消息响应导出 |
| `plugins/reasoning.mdx` | 思考过程（`reasoning`） | 展开/折叠、分组和 renderer scope；关闭贡献与仅折叠的不同。 | 推理流及折叠 |
| `plugins/tool-group.mdx` | 工具组（`tool-group`） | 工具分组、嵌套内容和 children/受控展示；不承担执行工具。 | 多工具成组 |
| `plugins/add-attachment-action.mdx` | 添加附件（`add-attachment-action`） | 选择、草稿附件、上传适配器与失败/删除；前端按钮不提供存储后端。 | 文件选择与失败 |
| `plugins/dictation-action.mdx` | 语音输入（`dictation-action`） | 开始/停止、DictationAdapter、权限、不可用/错误；不承诺内置语音服务。 | 替身转写与权限 |
| `plugins/submit-action.mdx` | 发送与停止（`submit-action`） | send/cancel、运行禁用、队列条件、原生事件透传。 | 发送/停止/排队 |
| `plugins/response-footer.mdx` | 回复底部操作区（`response-footer`） | 完整响应末尾单次渲染、actions 语义 Slot、分支、追加控件时保留原动作。 | 多消息响应及扩展动作 |
| `plugins/conversation-suggestions.mdx` | 开场建议（`conversation-suggestions`） | 空状态建议、标题/描述、renderSuggestion、选择行为和替换内容。 | 多种开场建议 |
| `plugins/thinking-indicator.mdx` | 等待与思考提示（`thinking-indicator`） | 消息范围的等待占位、耗时、让位推理/工具的规则；与 reasoning 独立。 | 等待到工具/文本切换 |
| `plugins/tool-timeline.mdx` | 工具执行时间线（`tool-timeline`） | 消息级摘要、详情/展开、原工具详情和受控状态。 | 运行/成功/失败工具 |
| `plugins/tool-fallback.mdx` | 通用工具与审批（`tool-fallback`） | 未知工具的参数/结果/错误/审批；compound parts 定制，保留确认和中断语义。 | 未知工具与审批 |
| `plugins/transient-assistant-messages.mdx` | 临时展示消息（`transient-assistant-messages`） | 页面内存消息、锚点、角色与公开服务；不进入模型上下文、运行或持久历史。 | 临时消息生命周期 |
| `plugins/agent-status-message.mdx` | Agent 状态卡片（`agent-status-message`） | 实际命名工具载荷、生命周期投影、无效载荷与 Fallback、renderStatus。 注册契约：`tool` / `mock_agent_status`。 | 状态成功/失败 |
| `plugins/agent-plan-message.mdx` | Agent 计划（`agent-plan-message`） | 权威 activity snapshot/delta、校验、历史/恢复与前端不擅自完成步骤。 注册契约：`data` / `agui-activity/agent-plan`。 | 计划增量与恢复 |
| `plugins/job-progress-message.mdx` | 任务进度（`job-progress-message`） | 命名工具、进度载荷、Host state/abort 绑定、取消与 Fallback。 注册契约：`tool` / `run_ci_job`。 | 进度与取消 |
| `plugins/generated-file-message.mdx` | 生成文件（`generated-file-message`） | 成功结果与 URL 校验、文件信息、失败/不支持载荷和自定义渲染。 注册契约：`tool` / `generate_file`。 | 文件结果卡片 |
| `plugins/chart-message.mdx` | 图表消息（`chart-message`） | chart 数据注册、数据约束、CSS、格式化和自定义条目；无效数据处理。 注册契约：`data` / `chart`。 | 图表与数据表替代 |
| `plugins/source-citations-message.mdx` | 来源引用（`source-citations-message`） | search_sources 结果校验、链接、来源集合和自定义渲染。 注册契约：`tool` / `search_sources`。 | 多个来源与错误 |
| `plugins/retrieval-chunks.mdx` | 检索片段（`retrieval-chunks`） | search_docs 调用、内容/数量/展开、DOM props 和 searchTools 文案覆盖。 注册契约：`tool` / `search_docs`。 | 多片段与空结果 |
| `plugins/web-search.mdx` | 网页搜索（`web-search`） | web_search 状态/结果、可见数量/轮播、DOM props 和统一搜索文案。 注册契约：`tool` / `web_search`。 | 搜索中/结果/错误 |
| `plugins/conversation-thread-list.mdx` | 历史会话列表（`conversation-thread-list`） | Host 会话服务、搜索/分组/删除/重试、sidebar/header actions 和 list 主题。 | 列表各状态 |
| `plugins/conversation-new.mdx` | 新建会话（`conversation-new`） | canonical Runtime 新线程动作、运行中条件、事件拦截；不依赖历史列表入口。 | 新建会话 |
| `plugins/conversation-quote.mdx` | 引用回复（`conversation-quote`） | 选区工具条、草稿预览、清除/发送/线程切换和历史保存。 | 选区引用全过程 |
| `plugins/agent-identity.mdx` | Agent 名称与标识（`agent-identity`） | 名称/Logo/描述和布局位置；展示身份与认证权限分开。 | 名称与标识定制 |
| `plugins/auth-account.mdx` | 账号入口（`auth-account`） | Host auth.session、用户展示/账号操作、未登录与无服务状态。 | 替身身份状态 |
| `plugins/auth-gate.mdx` | 登录门禁（`auth-gate`） | Host 认证服务、门禁/加载/错误、服务绑定与清理；不提供账号后端。 | 门禁状态切换 |
| `plugins/conversation-surface.mdx` | 会话主界面（`conversation-surface`） | Live/History、欢迎区/建议/输入/renderer Slots、上下文与服务前提。 | 主界面组合与历史 |
| `plugins/lexical-composer-input.mdx` | Lexical 输入框（`lexical-composer-input`） | 可选 /lexical 依赖、原生输入/组合 props、输入法与 Mention/Slash、textarea 选择。 | 富输入与输入法 |
| `plugins/lexical-edit-composer.mdx` | Lexical 消息编辑（`lexical-edit-composer`） | 可选 /lexical、已有消息编辑、保存/取消、原生输入/组合 props。 | 编辑与取消 |
| `plugins/mention-trigger.mdx` | @ 提及入口（`mention-trigger`） | 来源可选注入、稳定 ID、候选/加载/错误/取消；只改变草稿。 | 异步候选与失效 |
| `plugins/slash-command-trigger.mdx` | / 快捷命令入口（`slash-command-trigger`） | 菜单、过滤、禁用、action/directive 与命令来源；与 Creator 三命令区分。 | 命令菜单与行为 |
| `plugins/task-group.mdx` | 任务组（`task-group`） | 实际 task-group scope、嵌套展示、状态和边界；展示子代理不等于执行能力。 | 嵌套任务组 |
| `plugins/theme-switch.mdx` | 主题切换（`theme-switch`） | 已有主题服务、可选项和切换状态、Host 主题约束。 | 主题切换 |
| `plugins/context-retrieval-message.mdx` | 上下文检索消息（`context-retrieval-message`） | CONTEXT_CONTENT 数据注册、分组/去重/载荷校验、无效数据处理；不翻译协议 ID。 注册契约：`data` / `CONTEXT_CONTENT`。 | 检索分组 |
| `plugins/locale-switch.mdx` | 语言切换（`locale-switch`） | 现有 locale 服务、语言选项、文案联动和清理。 | 中英文切换 |
| `plugins/plugin-contract.md` | UI Plugin、Slot 和服务契约 | 公开 Plugin 类型、capability/cardinality/scope、生命周期、绑定和服务；注册错误、重复 ID。 | 类型/服务索引 |
| `plugins/create-plugin.md` | 创建和注册自定义 UI Plugin | 定义入口、manifest/definition、注册、生命周期、能力和 Slots、服务注入与清理、验证。 | 最小可运行 Plugin |

核对入口：`packages/plugins/src/catalog/plugin-delivery.json`、每个 `src/plugins/<id>/plugin.json` 及 `adapters/`、`packages/plugins/src/public.tsx`；公开导出不完整时先记差距，不复制内部实现充当公开 API。

### integration/ — 应用接入与部署

面向：宿主前端开发者。默认写作批次：P0。

本章围绕生成应用的页面集成、应用配置、业务服务与构建发布，依赖和接口集中参考；每篇保留详细入口。Creator 开发工具入口和 Windows/内网开发环境归 `guide/`；代码定制归 `customization/`；完整应用类型与协议放在本章「依赖与接口参考」，Plugin 声明归插件开发，布局参数归定制章节。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `integration/index.md` | 应用接入与部署 | 按页面集成、业务服务连接与构建发布组织接入主线，区分应用、开发工具、界面能力和代码定制的章节归属。 | 接入路线图 |
| `integration/react.md` | 在 React 工程中接入 Agent UI | 生成入口 Agent、挂载区域、容器尺寸、保留宿主业务 UI、工程自己的 dev/build。 | 可运行 React 示例 |
| `integration/agent-options.md` | Agent 参数与配置 | 应用接入时设置 endpoint、语言、用户展示资料、适配器及配置文件入口；完整类型另见本章接口与协议。 | 参数与界面对应示例 |
| `integration/react-host-control.md` | 从业务页面控制 Agent | AgentUIProvider、Hooks、Outlet，业务按钮发消息/停止/新会话、状态和事件订阅；结算不等于回答成功。 | 业务按钮联动演示 |
| `integration/vue.md` | 在 Vue 工程中接入 | 独立 React producer 初始化、依赖计划、Web Component 引入、构建更新宿主和关联信息。 | Vue 接入与更新截图 |
| `integration/web-component.md` | 在 HTML 和其他宿主中嵌入 | ESM/register/独立脚本、config 与 attributes、尺寸、Shadow DOM、事件、卸载重挂；其他框架只给嵌入契约。 | 最小 HTML 示例 |
| `integration/connect-agent.md` | 连接 AG-UI 服务 | 应用 endpoint 配置、AG-UI 响应与运行状态验证；Creator 预览的 direct/proxy 仅作开发补充。 | 连接设置截图 |
| `integration/authentication-and-network.md` | 请求认证与网络部署 | 宿主的请求/会话凭据、同源/CORS/HTTPS、开发代理与生产 API 地址；不把展示 userId 当权限凭据。 | 配置关系图、网络示例 |
| `integration/history-backend.md` | 接入历史会话服务 | conversationDataEndpoint 或数据源、列表/加载/删除、线程 ID、历史投影和运行恢复前提；只定义前端契约。 | 数据契约与状态示例 |
| `integration/production-build.md` | 独立构建与生产部署 | 应用与 Web Component 各自构建、生产 endpoint、资源交付、内网部署与独立性检查。 | 构建产物与部署清单 |
| `integration/package-entries.md` | 依赖包与入口 | 公开包职责、生产/开发依赖、实际 exports 路由；不要把内部模块路径当公共 API。 | 导出入口索引 |
| `integration/react-host-api.md` | React Host API | Agent/Provider/Hooks/Outlet、用户展示资料、状态、事件、错误码及方法语义。 | 精确签名与生命周期表 |
| `integration/runtime-api.md` | Conversation Runtime API | Provider、ThreadBinding、tools/UI registry、观察接口、适配器、反馈、历史投影；canonical Runtime 唯一所有权。 | 公共类型生成表 |
| `integration/web-component-api.md` | Web Component API | config/attributes/events/register/host 的完整表、优先级、响应式变化、连接重建和清理。 | 属性事件表 |
| `integration/ag-ui-contracts.md` | 前端消费的 AG-UI 与扩展契约 | 消息/工具/活动/状态/中断与 CONTEXT_CONTENT、命名结构化结果；精确列当前投影和限制，不写 Agent 实现教程。 | 事件到 UI 映射表 |
| `integration/history-endpoint.mdx` | 历史数据源（`conversation-data-source`） | headless 服务、项目 API 配置、列表/加载/删除与错误；保留已有 Host 声明。 | 数据源与列表联动 |
| `integration/conversation-binding.mdx` | 会话服务（`conversation-service`） | headless 会话选择/历史协调、data-source 注入、共享状态与释放。 | 列表与 surface 联动 |
| `integration/locale-configuration.mdx` | 语言服务（`locale-provider`） | headless locale 服务、默认语言/域覆盖和 bindSetup 清理；与 Creator locale 分开。 | 语言服务联动 |
| `integration/frontend-tools.md` | 接入前端工具与自定义工具 UI | root-thread 工具声明/执行端与 UI 注册端分工、toolCallId、取消、continue、卸载和历史重放；不提供 Agent 后端。 | 弹窗/表单 demo |
| `integration/attachments-dictation-feedback.md` | 接入附件、语音与反馈适配器 | AttachmentAdapter、DictationAdapter、FeedbackAdapter 的宿主职责、能力开关、失败/取消；不内置上传或转写后端。 | 替身适配器与联动 |

核对入口：`packages/creator/README.md`、`packages/creator/docs/advanced.md`、`packages/operator/src/ui/setup/CreatorProjectIntegrationGuide.tsx`、`packages/runtime/src/host/AgentUIProvider.tsx`、`packages/web-component/README.md`、`docs/architecture/host-integration-recipe.md`。

### customization/ — 定制与扩展

面向：手写项目代码或开发 Plugin 的用户。默认写作批次：P1。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `customization/index.md` | 选择合适的定制层 | 布局改 AppUIModel，外观/组合改应用层，必要时接管实现；示例说明三个修改范围。 | 决策图 |
| `customization/layout-and-composition.md` | 布局、语义 Slot 与 Plugin 组合 | Row/Column/Stack/Panel/Slot、尺寸、响应式、实例 ID、启用/停用、语义替换；不新增 Schema 或微 Slot。 | 布局前后与模型片段 |
| `customization/application-layer.md` | 使用公开 Props、children 与 renderer 定制 | 定位薄应用层、传递公开参数、保留响应/工具 scope 和原有 Slot；无需源码接管的案例。 | 真实应用层代码 |
| `customization/themes.md` | 定制品牌、样式与主题 | 主题服务、公开 theme API/CSS、暗色和宿主样式隔离；沿用生成工程自己的 UI 栈。 | 品牌主题对照 |
| `customization/localization.md` | 定制语言与文案 | locale provider、域命名空间、Host 覆盖、en-US/zh-CN、纯展示 helper；上游不改文案。 | 文案覆盖示例 |
| `customization/mention-and-commands.md` | 自定义 @ 来源和应用 / 命令 | 稳定 ID、Mention 搜索/缓存/取消、action/directive、注册清理；与 Creator 的三个命令明确区分。 | 两个独立示例 |
| `customization/state-and-events.md` | 消费共享状态与应用事件 | snapshot/delta、run/thread 状态、应用事件订阅和清理；输入数据边界，不造第二个 Runtime。 | 状态驱动 UI 示例 |
| `customization/custom-renderers.md` | 自定义工具、数据消息与结构化结果 | toolkit/data registration、命名路由、公开 renderer、Fallback；为状态/计划/文件/搜索等提供产品自己的展示。 | 命名注册与错误样例 |
| `customization/generative-ui.md` | 可选 Generative UI 接入 | 核验 /generative-ui 实际公开入口、组件词表和 action registry、样式和数据约束；不等同于 A2UI 默认支持。 | 可选 demo，先验证再发布 |
| `customization/source-takeover.md` | 按 Plugin 接管实现源码 | 先展示具体计划并获同意、提取已安装版本、保留薄层/ID/Slots、切换 import；范围和后续普通编辑授权。 | 接管前后目录和确认 |
| `customization/test-customizations.md` | 验证定制与自定义 Plugin | 自己的 test/typecheck/build、状态样例、生命周期/样式/本地化、独立部署；明确静态检查与视觉验收。 | 检查结果与验收模板 |
| `customization/app-ui-model.md` | AppUIModel 与 Layout API | 持久结构、实例/组合、LayoutRenderer 和合法布局属性；既有 Schema 兼容，Props/renderer 不进模型。 | 类型生成表+组合样例 |
| `customization/testing-and-optional-entries.md` | 测试与可选实现入口 | core/testing、Plugins /lexical、/theme、/form-tools、/composer-support、/plugin-support、/generative-ui 等真实出口的用途与稳定性。 | 可选出口与依赖表 |
| `customization/command-source.mdx` | 应用命令来源（`conversation-command-source`） | headless 服务、action/directive 来源、注册和清理；不等同 Creator 命令。 | 服务与 / 菜单联动 |
| `customization/default-theme.mdx` | 主题服务（`theme-provider`） | headless 主题状态、默认值/持久条件、Host bindSetup 和清理。 | 主题服务联动 |

核对入口：`docs/architecture/npm-default-plugin-source-ownership.md`、`docs/architecture/frontend-tool-lifecycle.md`、`docs/architecture/composer-mention-slash-plugin-integration.md`、`packages/plugins/src/{public.tsx,generative-ui.ts}`、`packages/runtime/src/public.tsx`、`packages/renderer/src/index.ts`。

### guide/mock/ — 使用 Creator · Mock Agent

面向：界面开发者和验证人员。默认写作批次：P1。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `guide/mock/index.md` | 模拟联调 | 启动并连接 Mock、按目标选择场景、复现响应及切换业务后端；专项内容按需链接。 | Mock 面板与场景结果 |
| `guide/mock/builtin-scenarios.md` | 选择内置演示场景 | 按消息、推理工具、审批、计划、结果、子代理显示、取消恢复分组；选择后发送消息、资源要求、速度。 | 场景清单与可点演示 |
| `guide/mock/local-recordings.md` | 使用本地 JSONL 回放 | .agent-ui/mocks、atMs/event、顺序/大小/时长限制、读取错误、数据脱敏；不承诺自动录制真实流量。 | 最小 JSONL 和面板 |
| `guide/mock/author-scenarios.md` | 编写自己的 Mock 场景 | /mock-agent 公共接口、注册、HTTP/Vite 集成、前端呈现/后端参考场景区别；仅开发依赖。 | 可运行场景代码 |

核对入口：`packages/operator/src/ui/MockServicePanel.tsx`、`packages/operator/src/mock-agent/builtins/index.ts`、`packages/operator/src/mock-agent/recording.ts`、`packages/operator/src/mock/local-recording-store.ts`、`packages/operator/src/mock-agent/index.ts`。

### updates/ — 版本与更新

面向：项目维护者。默认写作批次：P1。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `updates/index.md` | 理解更新中心和版本 | 六包独立版本、兼容发行、Plugin 版本和源码 BASE；项目区/工具区与两阶段更新。 | 更新总览截图 |
| `updates/check.md` | 检查更新和阅读变化 | 目标 registry、缓存/离线/缺历史、累计变化和逐版详情、不兼容及部分发布；无可用元数据不等于最新。 | 多种检查状态 |
| `updates/package-upgrade.md` | 确认并执行项目依赖升级 | 独立 npm/pnpm 有锁工程的计划、版本/检查/保护范围、确认、过期重算、真实安装验证；不改应用层。 | 计划与执行截图 |
| `updates/source-sync.md` | 同步已接管 Plugin 的实现 | 读取实际安装 Plugins 的 BASE/LOCAL/TARGET、差异、自动/模型辅助/手动合并、验证和显式采用基线。 | 三方差异及采用 |
| `updates/recovery.md` | 处理升级失败与恢复 | 恢复记录、声明/锁/实际安装恢复、额外修改保护、未知残留进程人工审查；不宣称逆转脚本副作用。 | 恢复状态截图 |
| `updates/creator-maintenance.md` | 维护 Creator 与旧工程 | 实际工具安装身份、工具区当前只展示、人工升级与重启；旧 metadata/source 应保留，迁移单独评估。 | 维护路线与限制矩阵 |
| `updates/release-notes.md` | 更新记录 | 仅使用实际正式发布记录；按包/功能关联版本，不用测试合成发行或仓库版本冒充已发布。 | 发行来源链接 |
| `updates/compatibility.md` | 兼容性与支持矩阵 | Node/React/宿主框架/包管理器/平台和组合清单；版本支持标签的格式及证据来源。 | 审核支持矩阵 |
| `updates/limitations.md` | 当前限制与可选能力 | 工具自升级、共享 workspace 自动更新、yarn/bun、旧源码自动迁移、子代理前端工具执行等限制；随实现复核。 | 限制与前置条件表 |

核对入口：`packages/operator/src/ui/CreatorPluginUpdates.tsx`、`packages/operator/src/ui/PackageUpdatesOverview.tsx`、`packages/operator/control/src/project/source-registry/`、`docs/architecture/unified-update-center.md`。


### troubleshooting/ — 常见问题

面向：所有使用者。默认写作批次：P0/P1。

| 文章路径 | 标题 | 要写什么与边界 | 所需图示/示例 |
| --- | --- | --- | --- |
| `troubleshooting/index.md` | 问题定位入口 | 按启动、模型、工程、预览、Agent、组件、更新和部署分流；每页给症状/证据/检查/处理/验证提纲。 | 故障导航 |
| `troubleshooting/startup.md` | 安装、Python 与端口问题 | Python 准备失败、registry/网络、Windows 路径、端口占用、工具启动和正常停止。 | 脱敏错误样例 |
| `troubleshooting/creator-connection.md` | Creator 入口不出现或连接失败 | 服务启停、第一次配置重载、端口、当前工程身份、Vite 与其他适配器差异。 | 入口/连接错误截图 |
| `troubleshooting/model-and-run.md` | 模型请求失败、任务停滞和取消 | 配置与凭据、超时、工具失败、待回答问题、取消后状态；不建议无依据扩大权限。 | 运行错误与诊断 |
| `troubleshooting/project-and-preview.md` | 初始化失败、工程损坏和修改未生效 | 源码位置冲突、已生成目录、注册表、构建产物、预览服务与旧进程；保留已有定制。 | 检查路径与对照 |
| `troubleshooting/agent-and-history.md` | Agent 不回复、历史或恢复失败 | endpoint、direct/proxy、CORS/认证、协议事件、会话标识和历史/恢复服务。 | 请求/事件证据 |
| `troubleshooting/plugins-and-input.md` | Plugin、附件、语音或输入菜单不可用 | 启用/组合/作用域、服务和适配器、协议命名、权限、来源为空、被默认模板排除。 | 能力前提表 |
| `troubleshooting/updates-and-build.md` | 更新、构建与部署失败 | 无更新元数据、兼容阻塞、计划过期、恢复未完成、资源路径、Vue producer 陈旧和生产误依赖工具。 | 对应状态与回执 |
| `troubleshooting/diagnostics.md` | 查看诊断并定位问题 | Creator 回执日志、预览连接、运行状态/事件观测和可选 debug；日志范围、脱敏与支持反馈材料。 | 诊断截图与日志样例 |


## 5. 统一文章规格

### 操作教程

用户目标与适用对象 → 前置条件与版本 → 按顺序的操作 → 对应真实截图 → 预期结果 → 失败分支和相关参考。每个步骤只解决一个操作，敏感配置脱敏。视频可选，文字必须独立可读。

### Plugin 专页

用途与效果 → Plugin ID/包入口/类型 → 是否默认启用和所需服务/事件/适配器 → 最小组合代码 → 可交互样例 → 状态与边界 → 公开 Props/Slots/服务 → 应用层定制 → 接管与更新注意事项 → 版本支持 → 相关教程。每篇只公开实际用户可用的参数，自动 API 表格需要人工检查。

演示至少覆盖与该 Plugin 有关的空/加载/运行/完成/失败/取消/不可用状态。服务型以消费者联动证明作用；结构化 renderer 提供合法/非法 payload；审批、附件、语音、认证和恢复明确宿主/后端前提。不能为每个 Plugin 建第二个 Runtime 或复制 Context。

### API/配置参考

公开入口与用途 → 精确签名/字段 → 默认值和必要依赖 → 生命周期 → 异常与不支持情况 → 最小例子 → 相关教程。API 页面解释契约，不重复完整使用教程。版本从真实发布记录提取，禁止按 Git 日期猜测。

### 故障排查

可观察症状 → 所需诊断证据 → 最少检查步骤 → 处理方式 → 验证恢复 → 未解决时需要的脱敏材料。任何“修复”都要说明是否改文件、依赖或状态，不让用户先清空工程。

## 6. 演示与截图准备清单

- Creator：已安装 npm 包的真实用户工程；分别保留初始化、提问、修改、确认、取消、回执、撤销/重做、连接、Mock 和更新画面。示例工程只能作为演示环境，不能把仓库开发依赖变成用户安装步骤。
- 三种产品形态：platform、assistant、embedded 各一个可重现组合。截图记录包版本、模式、语言、主题和测试数据，不声称所有默认预设都带所有功能。
- Plugin 演示：共享一套受控 Demo Host/Locale/Runtime，按应用层真实合同消费公开包；布局或样式影响大的示例用隔离容器/iframe。静态服务可使用确定性替身，页面必须注明。
- Mock 展示按当前 `showcaseMockScenarios` 及界面分组组织：消息与上下文、推理与工具、提问与审批、状态与计划、结构化结果、子代理呈现、取消与恢复。`mockRegressionScenarios` 和仅单独导出的 Composer/Quote fixtures 放模拟联调的自定义场景与验证说明，不全部冒充设置面板里的公开演示。
- 前端工具：弹窗、表单的执行和 UI 生命期各自验收；只承诺 root-thread 执行。子代理示例只说明已收到数据的嵌套展示。
- 凭据、账号、真实录制数据和文件 URL 脱敏；截图优先本地模拟数据，保存于 `website/docs/public/images/<section>/<article>/`。
- 截图不是 AI 说明的替代：操作、状态与结果必须有文字；图表给数据/解释，演示给关键代码。为 MDX 交互部分检查 SSG-MD 输出。
- 静态构建、类型检查、AX 树和截图/操作验收分别记录；Windows 未实际运行时明确标注，不用 path.win32 单测替代真实验收。

## 7. 发布前必须核验的能力边界

| 事项 | 计划中的表述和发布条件 |
| --- | --- |
| 未发布版本和历史缺口 | 不显示虚构的“自 vX 起支持”；更新记录只收真实正式记录。 |
| npm 包升级 | 当前重点是有锁文件的独立 npm/pnpm 工程；不能声称共享 workspace、yarn/bun、linked/local 声明都能自动执行。 |
| Creator 自升级 | 工具区展示与运行工具自动升级分开；不承诺当前能在页面里替换正在运行的工具。 |
| 升级失败恢复 | package.json/锁文件恢复不等于 node_modules 恢复；未知残留进程需人工审查，不能承诺自动回滚所有外部效果。 |
| 源码所有权 | 薄应用层默认项目所有；接管实现需逐 Plugin 同意；npm 升级、源码合并与 BASE 采用分别授权。旧源码不能自动覆盖或默认迁移。 |
| Vue/HTML | 使用 React producer 的 Web Component；不提供原生 Vue Plugin 生成。React Host 控制 API 不能直接照搬到 Vue consumer。 |
| 认证、附件、语音、历史与恢复 | 需要宿主或 Agent 提供相应服务；有按钮/类型/Mock 不等于业务后端开箱即用。 |
| 前端工具 | 目前的 root-thread 执行合同不能扩展为子代理执行合同；前端 UI 组件不是 Tool/Runtime/Model Plugin。 |
| Generative UI 与 A2UI | 现有可选公开 helper 需要独立样例核验；不要把历史 A2UI 文件、延后资源或内部 experimental 文件宣传为默认正式能力。 |
| 模型配置与 Agent 连接 | Creator 的模型密钥只在工具服务端；生产 Agent API 配置属于目标工程，二者不同。 |
| 运行与成功 | sendMessage Promise 结算、run-end、ready 事件各有精确定义，不能直接写成“模型回复成功”。 |
| 离线 AI 文档 | Markdown/索引已经随 Creator 包交付；专门的 AI 搜索/读取工具尚未接入，不宣传为现有按钮或工具。 |
| 内网访问 | 本地文件/知识库/HTTP 为不同读取方式；生成 llms.txt 不保证外网 AI 能访问内网。 |

## 8. 写作顺序、去重与验收

1. 第一批：产品概览、环境、安装、首个项目、三形态、生成文件；Creator 工程选择/模型配置/修改/确认/回执；React/Vue 接入、真实 Agent 连接、独立构建；Plugin 总览及 composer、surface、submit、response-footer 等核心组合。先覆盖一条可完成的用户旅程。
2. 第二批：其余 Creator 操作、最终用户对话能力、常用 Plugin、Mock、更新与故障排查；同时补齐对应服务/数据前提。
3. 第三批：剩余 Plugin、深度定制与接管、完整 API、兼容矩阵；可选或未验收能力只在核验后上线。
4. 操作说明只在教程写完整；Plugin 页解释该 Plugin，公共流程通过链接复用；字段/错误码只在参考页作为唯一维护源。不要在三个位置分别维护同一套安装步骤。
5. 每篇完成时记录：源码/包版本证据、截图或演示证据、Windows 状态、相关链接、HTML 效果和生成 Markdown。检查死链、图片/代码是否本地可用、本地搜索、AI 索引和 Creator npm 离线包收录。
6. 网站首页讲产品和入口；本规划文档保留在根目录内部 `docs/plans/`，不作为用户页面或离线手册发布。后续正文才进入 `website/docs/`。

## 9. 初次规划交付范围

初次规划仅完成能力盘点、导航/目录规划、逐篇范围、示例需求、依赖限制和写作批次，没有撰写正文或批量创建占位文章。后续正文交付见上方状态和独立进度记录。规划中所有相对文件位置均使用 `/` 作为逻辑路径，未引入 Windows 平台代码。
