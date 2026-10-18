# 统一更新中心与兼容版本清单

状态：Accepted，2026-10-17；2026-10-18 已接入第一阶段：真实版本来源、兼容清单校验、默认 npm registry 只读发现（保留旧 HTTP provider 兼容）、兼容稳定组合选择、累计/逐版本变更展示和明确的离线缓存状态。第二阶段已接入独立项目的 npm/pnpm 产物核验、用户确认安装/锁文件更新、失败恢复与安装后源码同步衔接。共享 workspace、其他包管理器、工具升级和意外中断进程的自动恢复仍未实现；不能扩大为所有安装宿主已完成统一升级。

本文定义官方包的发现、版本比较、统一升级和升级后源码同步。插件所有权继续遵守 [统一 Plugins 包与源码托管](npm-default-plugin-source-ownership.md)。本文取代此前“用户手动升级 npm，Creator 只处理源码同步”的决定；用户仍可在外部包管理器自行操作，但这不再是产品默认要求。

## 1. 用户流程与范围

用户只需要一个更新入口：查看当前版本和最新兼容目标、阅读变化、确认升级、查看验证结果，再选择是否同步已托管源码。Creator 负责解释与交互，Operator 负责确定性计划、安装执行、验证及恢复。模型不能自行猜测兼容版本或通过任意 shell 命令绕过升级计划。

更新中心在 Creator 启动、选中工程及用户打开更新页时，有界地检查官方更新；后台发现仅做读取、缓存和通知，不下载并执行代码、不修改依赖或本地源码。提供手动刷新及上次检查时间。网络失败或仅有缓存时明确显示“未能确认最新版本”，不能显示为“已是最新”。无需后台常驻服务或生产应用自行访问更新服务。

同一个页面包含两类更新，不增加新的 npm 总包，也不把七个包强制改成相同版本：

| 更新对象 | 官方包范围 | 执行位置与边界 |
| --- | --- | --- |
| 当前项目 Agent UI | Core、Renderer、Runtime、Plugins；工程确实使用时包含 Web Component | 绑定当前 React 生产工程及其实际 workspace/lockfile 所属位置；只更新需要的官方包及其必要依赖 |
| Creator 开发工具 | Creator、Operator | 绑定工具实际安装位置；不能把工具依赖写入目标应用的生产依赖。工具重启/重连独立执行 |

仅升级清单中与当前对象有关、确实需要变动的包；已满足目标的包不重复升级，未使用的可选包不顺带安装。传递依赖通过官方清单与包管理器解析，不为了展示方便给工程添加所有包的直接依赖。已有其他工程不会因当前项目升级而一并修改；共享 workspace 锁文件涉及其他成员时必须在计划中说明影响。

Agent UI 与 Creator 编码目标始终是 React。Vue/HTML 等宿主通过 Web Component 嵌入；只提供嵌入和 Creator 启动接入，不扩展为原生 Vue 组件生成、Vue 工程改造或另一套 Plugin Runtime。需要源码定制和升级的是 React 生产工程；重新构建的 Web Component 由既有嵌入路径使用。不能把预编译消费者目录当成可直接接管 React 插件源码的工程，也不自动修改宿主业务代码或部署产物。

## 2. 兼容版本清单

官方发布兼容版本清单，由经过验证的发行资料产生，Operator 校验后读取。它不是 Source Registry 的新名字：Source Registry 描述某个 Plugins 包中的插件、源码与来源；兼容清单描述跨包的可用发行组合。仍由现有包/开发工具承载，不增加独立的 Source Registry、兼容清单或更新中心 npm 包。

每个兼容发行组合至少描述以下内容；这是待实现的数据合同，不代表现有 `release.json` / `update-contract.ts` 已有这些字段：

| 信息 | 要求 |
| --- | --- |
| 身份 | Schema 版本、不可变组合 ID、发布时间、稳定/预发布渠道、清单来源与摘要；可有面向用户的发行标签 |
| 精确版本 | 包名到已发布精确版本的映射，包含项目/工具角色和必要/可选关系；版本号可各不相同 |
| 兼容要求 | 包之间的 dependency/peer 要求、最小 Creator/Operator、受支持 Node/React 与相关合同/API 版本；须匹配真实包元数据 |
| 变更记录 | 包及插件 ID 对应的新增、修复、破坏性变化、迁移要求和所涉及版本，提供可聚合但不丢来源的稳定标识 |
| 产物关联 | 对应 npm 版本、注册源/产物完整性资料，以及 Plugins 包 catalog 和源码快照的准确关联；不能用 latest 代替精确身份 |

组合 ID/发行标签、npm 包版本、插件内部版本、catalog Schema、历史 Source Release、项目源码 BASE 是不同身份。不得使用同一个 `releaseVersion` 字符串无区分地表达它们。兼容组合的版本不是第八个安装包的版本，也不要求 Plugins 内每个插件版本与包版本相等。

示例：一个组合可以选 Core 1.0.2、Renderer 1.0.3、Runtime 1.0.5、Plugins 1.0.8。上述数字仅作说明，不是当前发布事实。发布者在发布相应包并通过兼容验证后才将组合标为可用；所有被引用版本、catalog 和变更必须真实可获取。清单更新、撤回目标或发布不完整不能被工具视为一次可执行升级。

官方清单确定推荐组合，npm/配置的包注册源提供真实版本与产物；使用既有 npm 凭据与注册源约定，私有源不可达时报告原因，不硬编码公网唯一地址。默认直接通过项目目录下的 `npm view <包名>@latest --json` 查询 npm，沿用 `.npmrc`、scope registry 和凭据，不需要额外接口或官方清单地址。兼容组合和完整变更历史由 `releases/compatibility.json` 统一维护，构建和 prepack 自动写入各包的 `package.json.agentUI.compatibility` 与 `dist/compatibility.json`（导出 `./compatibility.json`）；npm 元数据负责发现，包内 catalog/sources 负责源码接管和同步。发布未完成的组合不推荐；缓存结果明确标记过期。保留显式 HTTP provider 供既有宿主兼容，默认不依赖它。不能用本地 fixture 冒充在线发现。远程数据不提供可执行 shell 命令，也不授予文件写入权限。

目标选择使用当前项目和当前工具实际解析的版本、用户选择的渠道及官方兼容要求。默认推荐最新兼容稳定组合；同时可展示更新但尚不兼容的版本及原因，不强制升级到 npm latest，不默认选择预发布或降级。工具自身的 Plugins 依赖不能冒充用户工程的当前版本；安装声明和实际解析版本不一致时先显示差异。

## 3. 版本与变更展示

默认展示“当前 → 推荐目标”的累计变化，按用户可理解的功能/插件归类，并突出破坏性变化、依赖升级与必要操作。逐包版本和逐版本记录可展开查看，用户不必逐个确认每个补丁版本。

例如 Plugins 从 1.0.0 跳到 1.0.8：汇总该区间可获取的全部发行记录，再按功能/插件合并重复描述，保留每项变化所属版本与原始记录。不能只展示 1.0.8 的最后一条 changelog，也不能遗漏中间版本的兼容迁移要求；资料缺失时显示缺口而非声称没有变化。正常情况下直接升级到选定组合；只有官方声明的迁移步骤确实要求中间执行时才按其处理。

统一总览同时覆盖默认 npm 引用的插件和本地源码托管插件：

- npm 引用：展示随包升级会采用的实现和变化。同一个 Plugins 包中的 npm 子路径不能分别固定不同安装版本。
- 已托管源码：分别展示当前已安装包版本、该插件的官方基线、本地修改状态和目标变化；npm 升级只提供新运行产物/源码材料，不等于本地实现已同步。
- 可选组件/包未安装：可展示相关信息，但不能把它们计为当前工程待升级依赖或擅自安装。

源码同步默认以升级后实际安装的 Plugins 包为 TARGET；升级前可以展示官方变更供决策，但在线较新源码、缓存或 Creator 自身依赖不能越过工程安装状态直接变成同步 TARGET。

## 4. 用户确认与 npm 升级计划

检查和规划只读。点击“升级”先形成具体可审查计划，列出目标对象/工程、当前与目标版本、直接变更和依赖联动原因、必要第三方/peer 变化、安装位置、包管理器、验证与恢复范围。明确哪些托管源码保持不变、哪些后续同步可选，不能把 npm 升级同意当成源码接管或合并授权。

计划绑定工程与工具安装身份、兼容清单摘要、实际安装版本、package.json/锁文件与 workspace 状态、用户应用层/已托管源码/BASE 的保护摘要。用户确认的是这份计划；目标、文件或范围变化后重新规划并取得相应确认，不允许执行时漂移到新的 latest。过期确认、仅浏览 changelog、模型声称“用户同意”都不能成为写入授权。

Operator 只在确认范围内执行：

1. 确定 package.json 及 workspace 锁文件的权威位置，沿用现有包管理器，保留依赖字段、非官方依赖与有效配置约定；规划必要的声明变化，并保证解析到批准的精确目标。不能盲目把 `workspace:`、`file:`、link、alias 或 override 改成 npm 版本；有歧义或不受支持时明确阻塞。
2. 预检当前应用层与托管源码的共享 API/peer 兼容性。存在不兼容且没有已确认的适配方案时，阻止执行该目标或选择较低兼容目标；不能先制造不可运行状态再要求用户接受自动源码修改。React/宿主 UI Library 的 major 迁移不属于默认官方包联动授权。
3. 通过包管理器真正安装并更新 lockfile，随后核对实际解析版本、产物身份、catalog/快照及计划一致性。只编辑 package.json 不算升级完成，不能无条件删除 lockfile 或重建所有依赖。
4. 保持应用层、已托管实现、引用来源和 BASE 不变；基于新依赖刷新必要的派生注册表，执行工程现有相关检查、类型检查、测试及构建，开发预览可用时检查当前 Runtime。不能把旧验证或缺少浏览器时的 unavailable 当作本次 Runtime passed。
5. 展示每个对象的安装与验证结果，并将可同步的托管源码交给下一阶段。依赖已安装但验证未通过必须如实显示，不能仅凭安装退出码宣称成功。

执行互斥和工程变更保护复用现有机制，避免模型编辑与安装并发修改同一目标；不能增加覆盖普通会话的应用级全局锁。生产 Agent App 不导入更新服务、兼容目录读取器、Creator 或 Operator。

## 5. 工具升级、恢复与阶段状态

项目和工具更新共用页面与计划解释，但安装位置、进程生命周期和事务分离。Creator/Operator 依赖由工具实际安装宿主管理，不能借当前项目的包管理器改写全局或其他宿主的安装位置。不可识别/只读/外部托管的工具安装报告限制，不自动猜测安装路径或退回让用户逐包处理。

工具必须先升级才能支持项目目标时，更新中心先展示工具前置项，在用户确认后通过安装宿主的受控过程准备新工具并重启/重连。不能让当前 Python/Operator 请求一边执行计划一边覆盖其自身运行代码。重连后重新检查项目；计划实质变化需再次确认。具体的安装宿主适配和重启执行器仍待实现，不能宣称所有全局/嵌入宿主已支持自动升级。

依赖安装是独立于源码文件事务的能力。实施时必须记录变更前 package.json/lockfile、实际解析版本、阶段和恢复资料，尽可能在隔离环境预检。失败时恢复本次改动的声明/锁，并重新安装原依赖；恢复也失败时显示部分完成/待恢复状态及可重试入口，不把只还原 JSON 说成 node_modules 已恢复。共享 workspace 其他用户改动、缓存、生命周期脚本及外部副作用不在普通文件回滚的承诺内；不能覆盖并发编辑或未纳入计划的文件。

页面分开表达以下结果：发现/计划待确认、依赖安装中、依赖验证完成或失败、托管源码同步待选择、合并待验证、基线已采用，以及工具待重启/恢复待处理。该列表是产品状态边界，不要求将 Creator Agent 固化为固定编码工作流。npm 升级成功而用户暂不合并源码是合法状态；源码合并失败或取消，不伪称 npm 也未升级，不自动撤销已经完成的另一阶段。

## 6. 升级后的托管源码同步

安装完成后按插件比较旧 BASE、LOCAL 和当前已安装 Plugins 中的 TARGET，只对实际有官方源码变化的条目提示同步。用户可暂不处理、选择完整同步或明确的定向特性移植；不强制把全部本地源码统一到最新版本。

同步仍复用现有 Operator source-only 计划与 Creator 模型/手动合并入口。BASE 是上次采用的准确官方快照，LOCAL 是当前实现，TARGET 通过安装后的包身份、catalog 和摘要校验。只允许已托管实现子树参与新增/修改/删除；用户薄应用层、配置、AppUIModel、共享服务声明及其他插件的定制不进入合并或 BASE。不能通过 npm 升级偷偷完成新的源码接管。

模型合并不授予推进基线的权限；用户审查并经 Host 验证后才采用 TARGET。缺失历史、冲突未解决、应用层变动、共享 API 不兼容或验证失败时保留原 BASE，并提供可重试结果。定向移植只形成 LOCAL 定制，不冒充整个 TARGET 已同步。必要的应用层 API 迁移要独立规划、解释和确认，不借源码同步覆盖用户代码。

## 7. 当前差距与实施位置

下表记录原规划时的差距与实施位置；第一阶段的落地边界见下节，不能把表内历史常量问题当成仍未修正。当前独立 npm 包、44 个现代插件的薄应用层/接管/同步机制和 Composer 真实模型旅程保留；本方案不顺带重构 Runtime 所有权、扩大插件 API 审计、迁移旧工程或修复旧 fixture。

| 工作面 | 当前事实与具体改动位置 |
| --- | --- |
| 官方发行资料 | 新增兼容版本清单及聚合变更合同/校验/构建发布流程；与 `scripts/build-public-packages.mjs`、`scripts/verify-public-packages.mjs`、Plugins catalog/changelog 生成协作。发布资产位置和远程 Provider 待定，不新增 npm 包 |
| 版本单一来源 | `plugins/src/catalog/package-plugins.ts` 的 runtime.version 目前固定 0.0.1；`operator/src/project/source-registry/updates.ts` 默认 creatorVersion 为 0.1.0。改为实际包/工具身份，补跨版本验证，避免错误依赖计划或兼容放行 |
| 发现与比较 | 新增 Operator 兼容发行 Provider、npm 注册源查询/缓存和工程/工具版本快照（拟新增 `operator/src/updates/compatibility-release.ts`、`release-provider.ts`，具体拆分随实现校验）；现有 `source-catalog/release.ts` 的 InstalledUpdateSourceProvider 只读工具依赖中的资源发布，不等于在线更新源，也不能当用户实际已安装版本 |
| 更新合同与聚合 | 扩展 `operator/src/update-contract.ts` 与 `project/source-registry/updates.ts`：分开兼容组合、包版本、插件版本、来源/基线身份，覆盖 npm 默认应用层；目前 inspect 跳过这些应用层，只聚合托管与旧源码更新 |
| 依赖计划与安装 | 新增受控 npm 升级规划/执行/恢复服务（拟新增 `operator/src/updates/package-upgrade-plan.ts`、`package-upgrade-executor.ts`），复用 `project/ensure-resource-packages.ts` 的包管理器识别与跨平台进程能力；其现有 ensureResourcePackages 只补缺失依赖、不升级现有声明，不能直接当升级器 |
| 工具宿主管理 | Creator 安装宿主/CLI 增加工具安装身份、受控重启与恢复通道（拟新增 `creator/src/updates/tool-update-host.ts`）；与 `PythonCreatorProcessManager.ts`、`workspace/CreatorWorkspaceManager.ts` 协作，避免自覆盖和把开发依赖装入生产工程 |
| 确认与开发期 API | 扩展 `creator/src/updates/update-api.ts`、Operator 公开更新入口及 `contracts/creator` 对应合同/类型：只读检查、绑定计划的确认执行、进度/恢复/工具重连。沿用现有授权和当前工程校验，不把 confirmed 布尔或模型自然语言当作独立凭据 |
| 页面与通知 | `creator/src/ui/CreatorPluginUpdates.tsx`、`CreatorWorkbench.tsx` 增加项目/工具分区、累计变化、逐版本展开、真实当前/目标、依赖联动及阶段进度。默认 npm 插件也在总览出现；复用统一 locale，新增文案 en-US/zh-CN 对等 |
| 源码同步衔接 | `operator/src/project/owned-plugin-updates.ts`、`takeover-plugin-source.ts` 和 ownership/BASE 机制复用；只在安装及实际包校验完成后生成新同步计划，旧计划失效。刷新 UI 时保持 npm 安装状态与源码基线状态独立 |
| 打包与兼容 | 官方七包继续独立发布；核对全部 exports、包/清单版本、插件内部版本、运行/快照一致性、浏览器图及独立生产构建。Web Component 仍是 React 生产工程的兼容产物 |

建议实施顺序：先修真实版本来源并定义发行清单 → 只读在线检查与变更聚合 → 用户确认与项目依赖安装/恢复 → 工具宿主升级/重启 → 安装后源码同步衔接与 UI 总览 → 真实包管理器、真实 Creator/模型与 Windows 验收。每阶段报告边界，不把清单或按钮存在当作整条链路完成。

## 第一阶段实现与配置（2026-10-18）

- `compatibility-release.ts` 校验 Schema 1、不可变发行 ID、精确稳定版本、官方包白名单、跨包依赖范围、Node/React 和最小工具要求；`package-update-service.ts` 使用项目/工具实际安装位置，沿直接及传递依赖解析，检测缺失、声明冲突、多个版本和降级风险。默认只推荐兼容的稳定组合；预发布选择 UI 尚未开放。
- Plugins 目录的 npm 版本来自自身 package.json；旧源码更新服务不知道 Creator 版本时，不再伪装为 0.1.0，存在最低版本要求即明确阻塞。插件内部版本仍独立。
- 默认 `NpmCompatibilityReleaseProvider` 在目标工程执行 npm 元数据查询，读取真实 latest 身份和发布者随包维护的兼容历史，验证组合内精确版本已发布，按工程隔离缓存及并发请求；不可变组合被改写、元数据缺失或不可达时不报最新。无需设置 `CREATOR_UPDATE_MANIFEST_URL`。旧宿主显式设置该变量时仍使用原 HTTP provider，仅作为兼容入口；正常工程不依赖它。
- `/__creator/updates/check` 在保留旧源码检查结果的基础上添加可选 `packageUpdates`，分开包组合身份与历史 releaseVersion。默认 npm 包不再因没有 ownership 而从版本总览消失。API 始终绑定当前工程，源码检查启用只读模式，有待恢复事务时明确阻塞、不顺带恢复或覆盖文件；不提供本阶段 npm 安装/执行路由。
- 页面按项目/工具展示实际版本和推荐目标，聚合区间内功能变化，保留逐版本条目、不兼容原因与历史缺口。推荐来自清单要求的校验，不表示客户端已经向 npm 注册源确认这些产物可下载；该核验属于安装前阶段。`installationSupported=false`，页面明确暂不安装。既有源码计划/合并/验证采用按钮继续使用已安装包，不读取在线快照或改写 BASE。
- `scripts/prepare-compatibility-release.mjs --id <immutable-id> --notes <authored-json> --output <feed-json> [--previous <feed-json>]` 从七个真实 package.json 生成版本、官方依赖范围及 Node/React 交集，保留历史发行并通过同一 Schema 校验；notes 按完整包名提供 `historyFrom` 和 `changes`。`historyFrom` 是发布者对记录完整性的声明，不从补丁号连续性推测；缺失或区间资料不足时页面明确提示。该脚本只准备资料，不发布、部署或验证 npm 产物已存在；正式托管前发布者仍须完成发行验证。测试 feed 不作为正式发布记录。

第一阶段本身不执行依赖升级；以下第二阶段在此基础上提供独立项目安装。两阶段均不提供工具自升级/重启、发行清单磁盘持久缓存或默认正式在线地址。验证记录见 [第一阶段记录](../verification/unified-update-discovery-2026-10-18/README.md)。

## 第二阶段实现边界（2026-10-18）

- `PackageUpgradeService` 与独立的 `/packages/plan`、`/packages/execute`、`/packages/recover` API 接入真实 Creator 更新页。已有源码 `/plan`、`/merge`、`/adopt` 保持独立。Creator 项目操作使用既有 mutation 互斥，执行时不与模型写工程并发；页面先展示具体包版本、包管理器、锁文件、检查和保护范围，再单独确认执行。规划不写工程。
- 安装前要求实时官方清单；缓存/离线只能展示，不能创建或执行安装计划。计划绑定 canonical 工程位置、清单摘要、精确已安装版本/位置、原 package.json、原锁文件和受保护工程摘要，15 分钟过期；确认执行时重新检查。包管理器不执行远程清单中的命令。下载和校验用目标工程 cwd 下的 npm `view` / `pack --ignore-scripts`，沿用 npm 支持的 `.npmrc`/scope registry/凭据，不输出命令日志或凭据；非 npm 专属凭据配置需先提供 npm 可读取的配置。
- 兼容清单的依赖边按安装位置检查：项目包之间的要求必须由项目组合满足；Creator/Operator 的私有 Core/Plugins/Web Component 依赖属于工具安装树，不强制等于项目版本。工具之间的 Creator→Operator 要求仍须满足，生产包引用开发工具直接拒绝。真实 npm 验收发现并修正了此前把两个安装树混为一体的校验。
- 逐产物核对 registry 精确 name/version、SHA-512 SRI、实际 tgz 哈希、包内 package.json 和官方 dependency/peer 与兼容组合。Plugins catalog 必须与包身份一致；检查已托管源码的 shared API 版本、已存在薄应用层的 routing/scope/services 合同及第三方 dependency/peer 可满足性。不兼容依赖或应用迁移需要另行规划，不自动改 React/UI Library 或应用代码。
- 首批执行支持 **已有锁文件的独立 npm/pnpm 项目**，复用跨平台进程解析，保持依赖字段，仅更改确实升级的官方直接声明；传递包由包管理器解析，再逐一验证清单目标。没有锁文件、共享 workspace、链接/本地/alias 官方声明、重复声明、override/resolution、混合锁、yarn/bun 均明确阻塞，不能静默转为 npm。未安装可选包不添加。工具区仅展示，不升级正在运行的 Creator/Operator。
- 真实运行 install 更新锁文件，禁用依赖 lifecycle scripts；随后核对实际解析版本、锁中的审核产物 integrity、逐文件与 tgz 一致的实际安装内容、未漂移的声明，并执行工程已有 typecheck/build。没有这些 scripts 时只承诺依赖身份验证。工程检查脚本属于用户自己的代码，其外部副作用/缓存不能回滚。受保护工程文件包括薄应用层、已托管实现、AppUIModel、元数据、BASE 和配置；node_modules、.git 与根目录 dist/build/coverage 属于排除项（配置的 sourceRoot 位于这些输出目录时仍保护该目录）。保护校验发现变化时不覆盖用户新修改。
- 工程根持久 `.agent-ui-npm-update.json` 记录原声明、原锁、实际旧包版本和恢复状态；安装/验证失败时恢复原声明及锁，再通过 npm ci 或 pnpm frozen-lockfile 真正恢复安装，验证旧版本和原文件后才报告 restored。网络等原因导致恢复失败则保留 recovery-required，可在新的 Creator 服务中重试。恢复中发现额外编辑会停止而不是覆盖。若进程在 installing/recovering 中意外消失，不能证明残留子进程已退出或新锁归属，保留记录并要求人工审查，不自动重试或宣称已恢复。恢复文件不是撤销脚本/外部副作用的承诺。
- 恢复待处理时 `/check` 直接提供恢复状态，不依赖可能已损坏的 node_modules 或源码 catalog；普通失败重试需用户点击。npm 成功后重新读取实际安装 Plugins，继续已有源码同步，npm 执行不生成/采用新 BASE，不自动合并任何源码。旧源码计划通过依赖状态绑定失效。

验证见 [项目依赖升级记录](../verification/npm-project-upgrade-2026-10-18/README.md)。本轮使用真实临时 HTTP 注册源、真实 npm/pnpm 进程和构建后的官方 Plugins payload 验证；测试注册源不是正式发布服务。Composer 已通过真实 Creator/真实模型的 props、确认接管、npm 升级和冲突合并截图验收；fixture 链接转 npm 导致路径缓存，保留同一工程重启宿主后完成同步，详见 `docs/verification/creator-real-npm-update-2026-10-18/README.md`。未做原生 Windows 验收，旧 fixture 未修复。

## 8. 验收要求

- 1.0.0 → 1.0.8 一次规划/确认，汇总中间版本变化并可展开；包版本不同、无新源码、破坏性迁移、缺失 changelog、不可用渠道与网络离线分别正确表达。
- 默认 npm 插件、已托管插件、未安装可选包、旧源码/历史 Source Release 均有准确身份；没有 updates 不能由过滤掉 npm 插件得出。
- 不同版本组合和 minCreator/Operator/peer 冲突由确定性校验处理；不因固定 0.0.1 / 0.1.0 常量或模型推测放行；无授权、过期计划、工程切换、锁文件/目标变动均不执行。
- 使用临时真实注册源/已构建 tarball 和真实包管理器执行 npm 安装，核对 package.json、lockfile 及实际解析版本；覆盖 workspace 共享锁、并发编辑、失败恢复与恢复失败。仅解压 tarball 替换目录不算本阶段包管理器安装验收。
- 升级前后应用层、已托管源码、引用、Plugin/实例 ID、AppUIModel、配置和 BASE 保持；源码完整同步在另行选择后合并并验证，推进 BASE 而保留 LOCAL 定制。部分移植、失败/取消不误记为已同步。
- 工具升级独立位置与受控重启/重连；生产依赖无 Creator/Operator 注入，其他工程不被修改，Vue/HTML 不产生原生组件改写。
- 用户确认、模型冲突合并、更新 UI 及当前 Runtime 在真实 Creator 中完整运行并截图；测试不能伪造在线版本、模型结果、BASE 或完成回执。
- Windows 是必要平台：native 文件路径与 POSIX manifest 路径分离，URL 使用标准转换，复用进程 helper；覆盖 drive/UNC、空格/Unicode、大小写、CRLF、`.cmd` 调用、打开文件替换和恢复。macOS/静态 fixture 成功不代表原生 Windows 验收；旧 fixture 修复继续暂停。

## 随包发布流程

每次发行使用 `scripts/prepare-compatibility-release.mjs` 从真实包版本、依赖与经审阅的变更记录生成组合，将结果保存到 `releases/compatibility.json`，保留既有组合 ID 和内容。随后运行正式构建和 pack；各包 build/prepack 执行 `scripts/sync-package-release-metadata.mjs`，阻止缺少当前版本或依赖要求已漂移的清单进入产物。清单不是自动推断的兼容承诺，发布者仍须验证组合。npm 全部目标版本可获取之后客户端才展示该组合。Plugins 源码仍由现有 catalog、快照和哈希验证发布，不从 Creator 内嵌副本读取。
