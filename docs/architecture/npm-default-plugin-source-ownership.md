# 统一 Plugins 包、内置源码目录与按需源码托管

官方 46 个 Plugin 使用唯一无前缀 ID，由一个 `@za38.03/agent-ui-plugins` 包交付运行实现、catalog 和匹配源码快照。准确清单与应用合同来自 `packages/plugins/src/catalog/plugin-delivery.json`，不维护第二份官方身份列表。

六个公开包 Core、Renderer、Runtime、Plugins、Web Component、Creator 独立版本。Creator Agent 位于 `packages/creator/src/agent`，Operator 位于同包 `operator`；用户只安装一个 Creator 开发工具包。Node 目录与源码操作由 Creator `/source-registry`、`/project/*` 提供，生产前端保持独立。见 [TypeScript 发行](../../packages/creator/docs/typescript-distribution.md)。

全部官方插件已支持默认 npm 实现、项目薄应用层、显式确认后的源码接管及独立实现同步。46 个插件的公开展示 props 已按 [统一约定](plugin-public-props.md)核对。

[统一更新中心](unified-update-center.md)支持只读兼容发现、累计/逐版本变更，以及已有锁文件的独立 npm/pnpm 项目的产物核验、确认安装、锁更新和失败恢复。源码合并与 BASE 采用单独确认。安装执行限定为已有锁文件的独立 npm/pnpm 工程；事务拥有者不明时先人工核对。

## 1. 通用基础设施与应用配置

保持现有六个公开包，不新增包。Core 提供基础 Agent 契约，Renderer 保持纯布局语言与确定性渲染；Runtime 的独立 `/ui` 入口提供 AppUIModel 校验/编译、插件生命周期、服务注入、Slot 组合、前端工具协调、诊断、通用会话服务及应用组装。正式 Conversation Adapter 不导入生成项目，也不因同包交付而接管插件组合职责。Plugins 提供官方组件、公开扩展接口和工具资产；Web Component 提供嵌入；Creator 负责开发期生成与受控修改。

新初始化不再复制 `runtime/`、`framework/`、默认会话展示组件、完整语言表、状态投影、默认 toolkit 或空事件/工具示例。Runtime `/ui` 的 `createAgentUIProject` 提供默认配置、资源绑定和最后有效组合的热更新保留；Plugins 提供共享会话 Surface、欢迎/空状态组件、完整默认语言和紧凑展示样式。默认 toolkit 为空；搜索文件示例仅通过 Plugins `/search-files-example` 显式启用，不会随初始化注册。前端工具和会话 integration 的生成文件在实际安装资源后才创建，生产构建通过显式 glob 导入这些确定的构建期输出，不进行运行时发现。

用户工程不再生成 `config.ts` 或导出 `agentUIConfig`。主题、语言、文案覆盖、欢迎内容、推荐问题、面板宽度、事件 Schema、附件/听写/反馈与适配器、历史数据源及额外集成统一通过 React `Agent` props 传入；`styles.css` 提供本地样式覆盖，`app-ui.json` 继续拥有布局与语义组合，`plugins/*` 保留项目拥有的薄应用入口。`application/Agent.tsx` 和 `project-config.tsx` 只绑定 npm 应用组装与生成资源；业务协议、鉴权和请求转换仍由项目服务实现，再把实例或配置传给 Agent。Host 数据源仅替换已启用提供插件的服务值，不绕过 AppUIModel 启用关系；每个 Agent 的配置与服务保持隔离。Creator 的功能编辑目标指向项目 Agent 应用入口；旧项目文件不被 npm 安装或模板同步擅自清理。

此调整用于新生成工程。既有工程的应用层、本地实现和源码 BASE 不自动删除或迁移，npm 升级不授权清理旧文件。工具内的契约入口引用同一 Runtime 实现，避免编译规则分叉。包的浏览器入口不导入 Creator、Node 工具、源码快照或 catalog 读取器。

新工程也不生成 `services/agent-ui-theme.ts` 和 `services/agent-ui-locale.ts` 转导出文件。会话状态使用项目 `services/hooks/useConversations.ts`，刷新、独立详情读取及 canonical Runtime 操作使用独立的 `services/hooks/useConversationActions.ts`，只读订阅不依赖会话操作上下文。认证继续使用项目 `services/hooks/useAuthSession.ts`。主题读取使用 Runtime `/ui` 的 `useAgentUITheme`；文案和语言值使用 Plugins 的 `useAgentUILocale`、`useAgentUILocaleCode`。主题、语言切换插件直接通过 `usePluginService` 取得已声明的现有服务，传给展示组件，不再额外包装操作 Hook。服务标识与类型从 Runtime 的公开 `ui/services/agent-ui-theme`、`ui/services/agent-ui-locale` 子路径导入。展示组件保留 service props 和公开的值/回调定制能力，纯订阅适配由 opt-in plugin-support 共享，不创建私有 Context。提供方的注册、恢复与清理由原生命周期管理。主题、语言和文案覆盖通过 `Agent` props 配置。已有工程的同名文件保留，不自动删除或改写。

服务相关 Hook 统一放在 `services/hooks/`，其下不再按会话、认证拆分子目录，作为项目拥有的 React 访问层。服务契约和实现不反向导入 Hook；插件内部交互 Hook 仍属于对应插件。新模板不创建根级 `hooks/` 目录，已有工程的旧路径与定制文件不自动搬迁或删除。

根样式与可选能力分开交付。新模板使用 `styles-base.css`，Plugin 子入口加载自己的预编译样式；完整 `styles.css` 服务直接 facade 消费者。Lexical 经 `/lexical` 及可选 peers 按需加载，目标工程自己拥有依赖。

业务页面需要共享会话操作、状态和用户展示时，使用 Runtime 公开的 `AgentUIProvider` 与 Hooks。Provider 或 `Agent.user` 提供的 profile 只影响展示，不等于业务认证；业务登录与鉴权仍由 Host 服务负责。

## 2. 项目外壳

悬浮球、展开收起、面板定位、动画和响应式外观属于用户产品。Bootstrap 根据所选 Mode，只把对应的 Shell 组件及 `<mode>-shell.css` 初始化到 `application/shell/`，不生成其余两种组件或 `ModeShell`。三种外壳在 catalog 中分别由 `foundation/shell-assistant`、`foundation/shell-embedded`、`foundation/shell-platform` 拥有，Preset 只选择其中一项。`runtime-config.generated.ts` 静态导出所选组件为 `ProjectShell`；`application/project-config.tsx` 直接传入 `Shell: ProjectShell`，运行时没有模式路由。这些文件是项目应用代码，不是 Plugin 源码接管对象，也不是 npm Runtime 的实现 BASE。普通定制直接编辑这些组件和样式；初始化之后的 npm 升级和实现同步不得覆盖它们。

Runtime 提供 `AgentUIShellProps` 与可选项目 `Shell` 组件接口；未传入时内联渲染，不生成悬浮按钮。`Agent.assistantPanelWidth` 继续作为参数传给项目 Shell，默认面板宽度及视口约束归模板。Runtime 保留会话连接、Plugin 服务生命周期和 Slot 组合；Shell 在这些 Provider 内渲染，但关闭面板仅隐藏内容，不能卸载子树。AppUIModel 继续只定义壳内布局与语义组合。

Mode 只用于 Creator 初始化时选择固定模板。新工程的 `.agent-ui/project.json` 只保存 `sourceRoot`，生成的 `runtime-config.generated.ts` 只静态导出 `ProjectShell`，不生成 `agentUIRuntimeConfig`、产品 `mode` 字段、`ModeShell` 或模式切换逻辑。Runtime 的项目配置与 `AgentUIShellProps` 不接收产品 Mode；Shell 通过可选 `surfaceRef` 登记实际可观测的 DOM 容器，Runtime 关联当前组合 hash 并发布观测，不猜测父节点或设置模式相关尺寸。Assistant 只在展开时登记 Panel，收起时取消登记但保持 children 挂载；重新展开后重新发布当前组合。未提供 Shell 时使用无产品样式的普通容器，不按产品形态分支。

Creator/Operator 后续所需的模板来源和工作区策略，从已有 source-lock 中唯一的 `foundation/shell-*` 来源记录解析，仅用于工具，不写回项目 Mode 或传入生产 Runtime。已有带 Mode 的项目元数据继续读取且不自动改写；缺失或冲突的固定 Shell 来源必须明确报错，不能猜测模板。Web Component 沿用生产工程显式绑定的 Shell，不通过强制 `embedded` 改变外部形态；需要其他容器时单独修改项目绑定。

不自动迁移旧工程。已有本地 Shell 保持原样；使用旧 npm 内置 Shell 的工程若升级至这一接口，需要单独迁移到项目 Shell 并绑定组件，不能把升级视为文件迁移授权。

## 3. 项目应用层

每个官方插件在用户工程中保留一个很薄的、用户拥有的应用层。默认直接引用 npm 包的公开组件，不复制官方实现；需要定制时，Creator 在这层 JSX 中传 props、组合 children/子组件、替换 renderer 或使用公开扩展 API。只有这些方式无法满足需求且确实需要修改实现时，才询问用户是否接管当前安装版本的源码。应用层的创建和普通修改不是源码接管，不需要接管确认。

AppUIModel 仅负责布局、实例身份、启停和语义组合，不负责 React props、renderer 或上游基础组件配置。现有实例字段保持兼容，本决策不直接删除现有 JSON 字段或修改 Schema。

用户应用层与可接管的实现源码是两个所有权和更新边界：包升级、快照提取及实现源码三方合并均不得覆盖用户应用层。接管仅切换其实现引用，保留已有 props、组合及插件身份。此目标替代本文旧的“注册表在 npm 定义与本地定义之间直接切换”方式；当前 catalog 声明的官方插件已按此实现，兼容旧目录接管仍保留原路径。

## 4. Canonical 实现、元数据与构建

| 位置 | 职责 |
| --- | --- |
| `packages/plugins/src/plugins/<id>/upstream/` | 插件专属、未修改的上游展示源码 |
| `src/plugins/<id>/adapters/presentation/` | 产品展示、投影与本地化适配 |
| `src/plugins/<id>/adapters/project/` | 项目服务和作用域接线模板 |
| 插件的 application / definition / component 适配 | 默认 npm 入口、可提取实现与项目薄层合同 |
| `src/plugins/<id>/plugin.json`、`CHANGELOG.json` | 唯一插件 manifest 与变更记录 |
| `src/shared/` | 共享 upstream、产品适配和来源记录的单一 owner |
| `src/catalog/plugin-delivery.json` | 构建入口、应用模板、消息注册、Host 绑定和提取配方 |
| `source-layout.json` | canonical 文件与生成兼容视图的映射 |
| `resources/registry/` | foundation、integration、业务示例等资源描述 |

除首行外的缩写路径均相对于 `packages/plugins/`。`dist/catalog.json`、`dist/sources/`、`dist/resources/registry/` 与运行入口由这些 owner 生成，不手工修改。资源合同中的 `manifest.json` / `changelog.json` 视图不成为第二份权威元数据。

`src/internal/vendor-generated/assistant-ui`、`adapters-generated/assistant-ui` 和资源模板兼容路径是生成视图；编辑 canonical owner，上游同步须把审阅后的变更与删除写回 owner。共享 upstream 来源在 `src/shared/upstream/assistant-ui/`，按每个文件的 provenance 校验，不用一个来源 revision 代替全部适配记录。

浏览器入口不导入源码快照、catalog 读取器、Node fs/crypto、Operator 或 Creator。工具从目标项目实际安装的 Plugins 读取资产，而不是工具自身安装树。单 tarball 包含开发资产，不代表浏览器应该打包这些资产。

## 5. 薄应用层与语义接线

项目 Registry 始终解析本地 definition/application。默认薄层引用 npm 公开组件，以 JSX 传 props、children、renderers；实现接管后只切换对应 import，现有组合保持。薄层不是实现复制，不代表用户已同意接管。

应用层可以在本地 manifest 中新增语义子 Slot，并在自己的组件中显式渲染、在本地 definition 中暴露同一合同。这是应用层组合扩展，不需要接管 npm 实现。工具以准确安装包的身份和既有 Slot 合同为基础，仅合入本地新增 Slot；扩展时不得删除或覆盖包已有 Slot。npm 组件的透传仅证明包原有 Slot，新 Slot 必须由应用层实际调用 `renderSlot` / `renderScopedSlot`。这些应用文件不进入实现 BASE；升级造成既有合同不兼容时单独迁移应用层。

常用样式直接使用 `className`、`style`；折叠区域使用 `expanded`、`defaultExpanded`、`onExpandedChange`。只有真实独立子组件保留 `inputProps`、`buttonProps` 等对象；细部样式由组件对应的 `classNames` / `styles` 提供。具体属性由安装版本类型与 [逐插件 props](plugin-public-props.md)定义。

- 作用域 renderer 从既有 Host scope 取得 group、tool、children 等，通过 props 传给 npm 或本地实现，不复制 Context。
- Headless 消息插件留在 `applicationPlugins`，保留 `toolkit` / `dataMessageUIs` 的 kind/name 和本地 renderer，`Component` 返回 null。不能生成只有 Component 的空定义。
- `chart-message` 保留 `chart` 注册及 CSS/类型声明闭包；来源、检索与搜索保留实际数据投影、计数/cycle/DOM props 和统一 `searchTools` locale。
- `job-progress-message` 从已有 Runtime 读取 state/abortRun，以 props 桥接；不复制状态 Context。
- `tool-fallback` 与 `tool-result` 保留审批、中断、错误、重试和焦点恢复。`transient-assistant-messages` 只托管展示，临时消息 store、订阅和锚点仍共享 npm 实例，不写历史或 Agent 请求。
- Host 绑定应用来自安装 catalog 中通过完整性检查的模板。provider `bindSetup` 使用已有 Host service context 并保留 cleanup；共享 auth 声明仅在缺失时初始化，不纳入实现 BASE。业务连接、鉴权配置与 identity 内容归应用层。
- 可选 Lexical 保持在 `/lexical` 后，保留原生 input/composition props，不强制所有项目安装编辑器。

应用合同 hash 覆盖组件、scope、注册、Runtime 桥接、services、hostBindings 与 RailAction；不兼容时报告 `PLUGIN_SOURCE_APPLICATION_API_CHANGED`，应用迁移单独处理。源码合并不得自动改写薄层路由。

## 6. 首次源码接管

Creator 先用 AppUIModel 和应用层公开 props/组合。确需修改内部实现时，`takeover_plugin_source` 通过 Operator 的 `plan_plugin_source_takeover` 读取工程实际 Plugins 包，展示指定插件的维护责任与切换范围，并通过真实 human-input 中断取得同意。内部计划绑定实际版本、catalog 摘要、源码/运行文件、受影响实例和工程状态；模型不能自行传入 approval 作为授权。

拒绝或未答复时零实现写入。答案绑定计划 hash，恢复后包或工程变化使决定失效。内部 apply 再次检查计划，在临时工程生成注册并运行已有 typecheck/build/test（build 必须存在），成功后才事务提交。缺失依赖、快照、运行摘要或共享 API 不兼容时阻止执行。

```text
<sourceRoot>/plugins/<id>/
├── application.json       # 应用层与实现来源绑定
├── definition.ts          # 项目注册、身份、服务和消息接线
├── manifest.json          # 项目应用层声明
├── index.tsx              # 项目 props / children / renderers
└── source/                # 同意后提取的实现；独立同步范围
    ├── adapters/
    └── ...                # 完整配方声明的样式、类型、manifest、来源等
<metadataRoot>/plugin-ownership.json
```

实际 source 闭包由 catalog 指定，不能臆造所有插件都含相同目录。接管同时提取该插件实际消费的展示组件、展示辅助代码、局部交互与配套样式。`adapters/` 保留插件入口实现，`presentation/` 保存所需产品展示模块，`upstream/` 保存未修改的上游展示源码及其原有相对目录。所有文件位于该插件自己的 `source/` 子树；A、B 消费同一个官方按钮时，各自取得独立快照，修改或同步 A 不改写 B。官方仓库仍由 canonical owner 维护唯一实现，构建生成快照，不维护第二套官方组件源码。

Composer 的主体、队列、textarea、附件和提示按钮，以及其他插件使用的折叠、推理、Markdown、图片、对话框等展示模块按实际依赖闭包提取。纯展示 props 类型随实现保存；组件内部私有的预览/折叠 Context 可以随完整组件一起提取。会话 Runtime、Host/Composer 共享 Context、消息/工具状态、发送和审批操作、共享 transient store、主题/locale/Portal 容器仍从同一个 npm 实例读取。只提取混合模块中所需的展示声明和局部辅助函数，不复制 facade 全部实现或 Runtime Provider。保留 `/composer-support` 和 `/plugin-support`（API 1）的旧导出以兼容已有接管项目；新快照使用这些入口的状态/命令接口和项目安装的第三方库，不再靠这些入口导入已纳入快照的产品展示实现。

`takeover.requiredDependencies` 来自实际源码 import 与安装包的依赖声明。计划列出需要新增或恢复的直接依赖，用户确认后通过原包管理器准备，不静默升级冲突依赖；React、assistant-ui 与可选编辑器的共享实例还需核对真实解析位置。同版本的另一份 Context 也不视为兼容。依赖准备与源码事务分阶段：准备完成后重新验证包身份和受保护源码，再在临时工程运行现有检查。源码验证失败会保留已准备依赖，但不会提交实现或推进 BASE；不得把源码事务失败说成依赖也已撤销。

源码快照包含预编译展示 utility CSS、所需产品 CSS 与 CSS 声明，保持现有主题变量和 Portal 边界；提取的展示样式不因接管新增 Creator 或 Tailwind 编译器要求，工程既有样式构建流程保持。新的样式定制使用项目自己的样式工具。第三方 UI/Markdown 引擎继续是项目 npm 依赖，语言字典与主题基础仍共享，不承诺冻结所有第三方行为。

机械切换 import 必须保留 CRLF、现有 JSX/props、Plugin/实例 ID、AppUIModel、服务与语义 Slot。包模式合同来自准确安装包；成功接管后本地 manifest 和服务声明是权威，同 ID 不得双重注册。本地实现丢失时明确报错，不自动切回 npm。

接管同意仅覆盖该插件。已有成功接管后的普通适配修改无需重新接管，但仍先尝试应用层，不允许把 vendor 当作普通可编辑代码。npm 共享行为仍可能变化，不能承诺本地实现使全部运行效果冻结。

## 7. Ownership、BASE 与来源身份

`plugin-ownership.json` 保存按 Plugin ID 的来源、准确包/插件版本、批准计划和 catalog 摘要、origin 映射、sharedApis、应用合同及可离线恢复的 BASE 字节和 SHA-256。`implementationRoot: "source"` 的 BASE 只允许实现子树；文件必须通过摘要校验。

源码、Registry、ownership 和 source-lock 通过现有持久事务一起提交，失败恢复原来源，清理接管产生的空目录以便重试。生成 Registry、npm 升级或资源安装不得覆盖应用层、本地实现或推进 BASE。

兼容组合、npm 包版本、插件版本、catalog Schema、sourceRelease 和 BASE 是不同身份。已有 source-lock 的来源不得按同号 SemVer 重解释；缺少准确基线时阻止自动合并，不用 LOCAL、latest、当前 node_modules 或测试 fixture 冒充 BASE。正式归档查询可使用显式 historyRoot；准备记录只保存发行摘要，不替代完整源码档案。

## 8. 实现同步与基线采用

Creator 更新页通过 `OwnedPluginUpdateService` 使用 `/project/dev` 的 `planPluginSourceSync` / `syncPluginSource`。TARGET 只能来自项目实际已安装 Plugins 的匹配快照；在线 latest 或工具依赖不能代替它。

计划绑定工程、BASE、目标 catalog、依赖和受保护应用状态，显示 BASE/LOCAL/TARGET、文件新增/删除和冲突。按三方相等规则保留无冲突定制；冲突可由用户或 Creator 提供审查后的文本。当前按一个托管插件处理，不把混合批量同步伪装成一个事务。

先在临时工程验证，再事务提交实现与基线，独立核对应用层字节。模型合并后仍回到更新页显式验证采用，模型不能自行推进 BASE。应用层、Shell、业务连接与共享服务声明不进入实现合并、删除或 BASE。

不兼容应用合同要求单独迁移。失败、取消、冲突未解决或验证未通过保持原 BASE。定向特性移植只是 LOCAL 定制，不声称完整升级。采用失败恢复采用事务前状态，保留此前合并编辑；依赖安装恢复是独立阶段，不能互相替代。

已有有效定制源码和 BASE 保留，不因重新初始化、npm 安装或发现同 ID 而自动变成 wrapper，也不能补记接管授权。未知或残缺路径冲突不覆盖。既有源码保持原结构，不自动迁移。展示闭包扩充也只能通过显式实现同步纳入新增文件、依赖计划和三方合并；npm 升级不自动扩充或改写旧 BASE。

## 9. 默认组合与正式插件

三种初始化模板使用同一组 22 个启用插件；全部官方插件共 46 个，其余 24 个按需启用。embedded 复用 assistant 组合。默认表见 [插件启用情况](../../website/docs/plugins/default-plugins.md)。

`conversation-thread-list` 提供列表、搜索、归档及管理操作，`conversation-new` 是独立插件。Platform 通过列表的 `headerActions` 语义槽放置独立新建按钮，Assistant/Embedded 在页头使用图标入口及历史弹层。列表不内置新建动作，也不默认挂载兼容 RailAction。是否组合、顺序和区域尺寸归 AppUIModel；`showSearch`、`showArchived`、`itemProps.actions` 等留在应用 JSX。

`response-footer` 是唯一回复底部插件，使用 `assistantResponseFooter`，每轮完整回复仅在最后一条 assistant 消息下渲染一次；复制、导出、重新生成和分支保留整轮 scope。官方目录不提供重复 `assistant-ui-*` 或 `message-footer` 身份；已有项目源码与基线不因此被清理。

`tool-result` 默认用于 `conversation-surface.toolFallback`，支持文本、图片、音频、视频和文档，并保留基础工具详情和审批。专用工具 renderer 优先；该语义位置只选一个 fallback。`file` 来源须应用 resolver，不猜测提供方标识为 URL。

`ask-user-question` 是按需 Human Tool 插件，工具名 `ask_user_question`。单选、多选、文本及多步参数和答案校验由 presentation contract 唯一持有。应用模板保留 human 注册、Schema 与 renderer；Runtime 拥有权限、addResult 和续答。共享 `humanQuestion` locale 提供中英文，Mock 引用正式资源，不再交付问答 demo 资源。

`locale-switch` 按需启用，消费 `locale-provider` 的统一服务。当前语言与切换回调通过 Agent props，默认中文，不生成另一套字典或状态。

## 10. 模板与业务示例

初始化只为 AppUIModel 实际引用的插件生成薄应用层，保留必要的服务提供者与消息注册。后续添加插件时按需生成对应入口；已有项目文件不因重新生成 Registry 被删除或覆盖。纯 npm 目录中尚未使用的插件不要求项目预先声明其业务服务。

`conversation-suggestions.items` 接收动态业务问题及可选标题、说明，仍属于数据与组件组合扩展；省略时沿用会话建议，空数组不显示。通用 Runtime 默认业务建议为空。新模板将默认欢迎语与三条示例文案集中在 `application/locales.ts` 的 `conversation` / `starterSuggestions`，由 `application/project-config.tsx` 绑定。`getConversationStarterSuggestions(locale, resolvedMessages)` 只组织数量与顺序，Runtime 传入合并后的 locale 文案。Agent 不再提供重复的 welcome/suggestions 属性；Host 通过 locales 按字段覆盖。AppUIModel 不保存文案 props。

公开 API 按[逐插件 props 约定](plugin-public-props.md)统一：常用整体样式直接使用 `className`、`style`；检索卡片直接提供 `title`、展开状态与 `renderContent`，问答直接提供 `submitText`、统一文案域覆盖与整体样式。不为所有内部元素增加独立参数。数据解析、答复权限、历史只读与续答生命周期保持在原组件和 Runtime 中。

弹窗、表单等 `demo/*` 资源是一次性导入的业务起点。文件按资源清单进入项目 `plugins/`、`services/` 等目录，导入后归项目维护，不属于官方插件实现接管，也没有实现 BASE 或官方源码同步。`source-lock.json.examples` 仅记录已导入文件的逻辑路径；读取旧 `items` 中 Demo 哈希时转为路径记录，保留项目文件。之后的 npm 升级或示例模板变化不更新业务代码、增删其文件或要求它跟随新版示例依赖。其他受管源码仍使用原有哈希与版本基线。

生成 Agent 的 `onLocaleChange` 向受控 Host 报告服务中的语言变化；示例 Host 用此回调同步页面文案，移除原来的 Host LocalePicker。未传 locale 的工程继续由语言服务驱动；传入固定 locale 的 Host 保留受控行为。


## 11. 验证与当前支持范围

发行和变更验证应覆盖：运行产物与快照同源、catalog/包身份、公开类型与运行转发、无同 ID 双注册、未经同意零接管写入、过期计划拒绝、完整文件/依赖闭包、离线 BASE、应用层/实例/语义 Slot 保留、共享 API 兼容、采用失败恢复及独立生产构建。源码存在或按钮可点击不能替代验证证据。

Windows 使用 native path 读写，manifest/归属与归档比较使用规范化逻辑路径，文件 URL 使用 `fileURLToPath` / `pathToFileURL`，进程调用使用跨平台 helper。检查 CRLF、大小写、路径穿越、文件占用和恢复，真实 Windows 结果单独报告。

已有项目保留原结构、实现与 BASE。公开 API 以实际安装包声明和目标工程验证为准；源码历史使用已配置的准确 BASE 和归档来源。可选 JSON Generative UI 见 [公开集成](generative-ui-integration.md)，依赖安装支持范围见 [统一更新中心](unified-update-center.md)。
