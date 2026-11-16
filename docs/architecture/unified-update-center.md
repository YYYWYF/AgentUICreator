# 统一更新中心与版本建议

Creator 是开发工具，Agent UI 的项目包是独立部署的生产依赖。六个公开包独立版本，Operator 随 Creator 发布，不另发包。此文的版本建议策略取代此前以兼容组合阻止用户升级的策略。

本文面向维护者、开发者和参与实现的 Coding Agent，记录设计与执行约束；用户操作指引位于官网更新文档及 Creator 界面。

## 1. 产品规则

- 复用现有启动、选中工程、打开更新页时的有界只读检查，不增加独立常驻追踪服务。
- Creator 只维护最新稳定版，修复和新能力进入最新稳定版，不维护旧版分支或承诺向旧版回移修复。用户可以保留旧安装用于离线工作、回退或暂缓升级；旧版问题优先建议升级后复现。
- 检测到 Creator 有新版，显示普通提示：当前版本、新版版本、请按原安装方式手动升级。用户可以继续使用当前版本；Creator 不代装工具、不提供工具安装执行入口、不因项目包版本或最低工具建议关闭功能。
- 项目包版本继续独立选择，不为匹配 Creator 而统一版本、自动升级或降级。最新版 Creator 按项目实际安装的公开 API、catalog 和源码快照工作，保留既有应用层、Shell、接管源码和 BASE。
- 项目包的清单、最低版本、Node/React/peer/dependency 范围和共享 API 版本用于推荐与说明，不能成为用户选择升级、启用插件、初始化或使用 Creator 的版本准入条件。
- 已安装且用户保留的版本不因推荐组合较旧而被视为禁止操作的“降级”。用户可在项目升级计划中明确选择目标，未选择的包保持当前目标；默认推荐不会自动降低现有版本。
- 版本说明不触发拒绝执行、隐藏确认按钮或安装回滚。真实的包管理器、类型检查和构建失败仍如实报告，不把“可以尝试”写成“已验证可用”。

## 2. 身份、建议与执行目标

这三类信息分别处理：

| 信息 | 用途 |
| --- | --- |
| npm 实际 name/version、dist-tag、完整性和已安装路径 | 发现新版、确认安装身份与来源 |
| releases/compatibility.json 的发行记录、minimumCreatorVersion、requires、Node/React 等范围 | 展示历史、累计变化和参考建议，不授予或拒绝操作 |
| 用户确认计划中的精确目标、包摘要、声明与锁文件 | 确保实际安装的是用户批准的目标，支持验证和恢复 |

发行记录保留准确版本，不将 changelog 身份改写为范围。版本建议中的差异放在 advisories 中，不再建立“兼容组合通过才允许升级”的关卡。记录的格式、协议字段、包名和来源完整性仍须正确；不能把损坏数据当成可信元数据。

## 3. 在线发现与展示

默认通过工程的 npm registry 和凭据执行 npm view，复用现有查询读取 Creator 的实际 latest 稳定版身份。Creator 升级提示只依据该身份，不从项目兼容历史推导工具目标，不因项目仍使用旧包而推荐旧 Creator。latest 指向预发布版本时报告该项查询不可用，不将其作为稳定版推荐；无法取得 latest 时不能把历史记录当作最新版本。某个无关包、源码检查或推荐历史不可用，不能抹掉已成功读取的 Creator 新版信息。

保留合并请求、有界刷新、缓存和明确的离线状态；无法确认最新版本时不能显示“已是最新”。可用的包元数据与推荐历史分别表达，缺少 changelog 时披露。过滤未发布的历史组合只影响推荐资料，不禁止用户选择实际已发布的包版本。

Creator 提示位于工作台顶部 Creator 标题旁，平时只显示“发现新版本”，hover 或键盘聚焦时才显示当前版本、新稳定版、只维护最新稳定版的政策和手动升级说明，并明确可以继续使用当前版本、项目包版本保持独立；移开或按 Escape 收起详情。普通工作区和更新页共用这一个顶部提示，不在内容区重复展示大卡片。提示提供 en-US/zh-CN 文案，不附带安装按钮，也不改动任务运行和项目选择。

项目更新仍展示累计和逐版本变化、破坏性说明与应用适配提示；接管插件使用准确安装快照的独立 changelog，不能把在线说明当作已同步源码。

## 4. 辅助工具与用户选择

Creator 是辅助工具，工程组织、包管理器、依赖声明、安装布局和升级结果由用户决定。workspace/monorepo、Yarn/Bun、额外或缺少的锁文件、overrides、补丁、linked/local/alias/tag 声明、提升依赖和重复声明不得作为初始化、升级或继续使用 Creator 的准入条件。依赖与兼容信息仅供参考；未安装依赖也可继续初始化。

用户确认具体方案后，Creator 只准备相应声明、生成源码或调用工程现有包管理器。不预先下载并校验 npm 产物，不校验实际安装版本、字节或锁文件，不自动运行 typecheck/build/test，也不以诊断结果触发自动回滚。用户自行检查安装结果和工程运行效果，包管理器真实失败如实反馈，不用 force 掩盖错误。

写入确认仍绑定选中的工程、文件和修改内容，保留取消、路径范围和并发写入保护。它们只保护这次已授权的文件操作，不作为版本或工程拓扑准入。npm 升级不修改项目应用层、Shell、业务配置、本地实现、引用来源和 BASE。

## 5. 安装失败与源码同步

安装失败保留当前状态和原声明记录，用户可以自行处理、重新升级或主动恢复原声明。失败记录不禁用后续升级、源码更新或其他 Creator 功能。恢复仅在用户明确选择后执行安装，不承诺恢复后的工程已通过验证，也不覆盖并发修改。

依赖安装与源码同步仍是独立操作。源码同步 TARGET 来自项目实际安装的 Plugins，按 BASE/LOCAL/TARGET 合并实现子树；应用层及用户源码的归属、明确授权和合并范围保持不变。源码接管/同步不要求 Host 提供 build 脚本，也不自动运行工程检查；用户确认合并后完成同步，自行检查运行效果。

Agent UI 与 Creator 的编码目标仍是 React。Vue/HTML 宿主通过 Web Component 嵌入；升级与源码定制针对 React 生产工程，不自动修改宿主业务代码或预编译消费者产物。

## 6. 实现与验证

- updates/npm-release-provider.ts 保留实际 npm latest 身份，兼容历史与当前包元数据共同用于展示。
- updates/package-update-service.ts 生成建议和非阻塞 advisories，Creator 最新信息不依赖项目推荐组合。
- updates/package-upgrade-service.ts 接收用户选择的项目包目标并调用工程包管理器，不运行安装前/后的工程或产物校验。
- CreatorPluginUpdates、CreatorUpdateNotice、PackageUpdatesOverview 展示手动工具提醒、项目方案和普通参考说明。
- 初始化、启用插件和源码工具保留现有声明；版本范围差异不强制安装不同版本或拒绝操作。
- 旧源码更新链路中的 minimumCreatorVersion 同样只作参考；真实的源码合同不受支持仍是对应操作的具体错误。

回归覆盖旧 Creator 非阻断提醒、实际 latest 与兼容历史不同、latest 缺失或指向预发布版本、推荐范围外的 Node/React/运行包、较新已安装包、不同包版本组合、Creator-only 更新、无关发现失败，以及未授权/过期计划/并发文件修改仍不覆盖用户内容。开发本功能时运行双语检查、相关类型检查和受控 npm/pnpm 安装测试，并独立验证实际 Windows 页面与截图。截图中的模拟新版数据必须明确说明，不能声称 npm 已发布。

## 随包发布流程

插件功能说明的 canonical owner 是 `packages/plugins/src/plugins/<id>/CHANGELOG.json`，插件名称来自同目录 `plugin.json`。发布前由 AI 或维护者按既有格式编写说明，再经过发行校验；Creator 不在用户检查更新时根据代码差异猜测或生成说明。

在线包级记录使用 `prepare-compatibility-release.mjs` 接收的 notes JSON：顶层键是准确的 npm 包名，每项 `changes` 包含 `id`、npm 包 `version`、`kind`、`summary`；属于插件的变化填写 `pluginId`，包自身的变化不填写。插件自身 CHANGELOG 的版本与 npm 包版本分别保持各自含义，不互相替代。准备脚本接收、校验并汇总已编写的记录，不自动从代码推断变更。

Creator 通过工程的 npm registry 读取随包发布的 `agentUI.compatibility`。默认以版本、Plugin ID 归组展示插件功能，名称读取工程实际安装的 Plugins 中的 manifest；不得用操作按钮文案替代名称。其他包及未标记 `pluginId` 的包级说明默认收起，用户可在决定升级前展开阅读；必需的迁移/破坏性要求仍显式提示。接管插件继续使用工程实际安装快照中的独立 CHANGELOG，不将在线包记录当作源码同步目标。

每次发行使用 `scripts/prepare-compatibility-release.mjs` 从真实包版本、依赖与经审阅的变更记录生成组合，将结果保存到 `releases/compatibility.json`，保留既有组合 ID 和内容。随后运行正式构建和 pack；各包 build/prepack 执行 `scripts/sync-package-release-metadata.mjs` 生成元数据，不作为开发启动的兼容性审核。发布者构建后显式执行 `pnpm check:release-metadata`，拒绝缺少当前版本或依赖要求已漂移的清单；现有 `prepublishOnly` 继续执行发布审核。清单不是自动推断的兼容承诺，发布者仍须验证组合。npm 全部目标版本可获取之后客户端才展示该组合。Plugins 源码仍由现有 catalog、快照和哈希验证发布，不从 Creator 内嵌副本读取。

六个公开包在构建开始时使旧构建记录失效，成功完成后生成 `dist/build-integrity.json`，记录各自的包身份、源码/构建输入与产物内容哈希。`prepack` 和 `prepublishOnly` 先执行只读一致性检查，拒绝缺少记录、升版后未重建、源码或依赖输入变化、产物缺失或被修改的包；Plugins 另检查 catalog 身份、源码与产物模板内容，以及模板中的官方包精确版本是否对应各包自己的版本。不要求各包版本相同，也不修改消费者的依赖。先准备版本和模板，再运行 `pnpm build:package`，可用 `pnpm check:package-integrity` 单独检查；检查失败不会自动修复或补建产物。

首次发行准备前，`releases/compatibility.json` 的 `releases`、`releases/plugins-history.json` 的 `releases` 保持空数组，插件 `CHANGELOG.json` 保持空对象，不保留模拟发行快照。开发构建和 pack 允许空历史。Plugins 的发行历史校验由发布者在本地显式执行，不接入 `prepublishOnly`；上述产物一致性检查独立于发行历史校验，不要求环境变量、不联网下载上一版，也不自动修改版本或 changelog。

本地先编辑包版本、`resources/registry/release.json`、各 Plugin 的 canonical `plugin.json` / `CHANGELOG.json` 和经审阅的兼容清单，完成构建后运行 `pnpm --filter @za38.03/agent-ui-plugins release:verify`。命令只读校验当前 changelog、版本、兼容资料、catalog / source 快照和本地历史；`release:prepare` 是同一只读校验的兼容入口，不再自动递增 patch。校验失败由发布者修正后重跑。

首次校验以随仓库提交的 `releases/plugins-history.json` 为准；文件缺失或损坏必须报错，不推断为首次发行。`pnpm --filter @za38.03/agent-ui-plugins release:record` 在相同校验通过后显式追加本地准备记录（发行描述、各 Plugin 源码摘要和累计 changelog）。该记录不含完整源码，不进入包内资源，不替代源码同步所需的精确 BASE/LOCAL/TARGET。Plugin 摘要组合现有 resource 摘要与 catalog 中全部 canonical Plugin 文件摘要，共享源码摘要另行记录以检测已准备内容漂移；仓库 `.gitattributes` 固定文本 LF，文件系统绝对路径不进入摘要。历史记录应随代码提交，不可随意重写；已记录版本内容变化需恢复原内容或提升发行版本，再校验和记录。相同内容重复记录是幂等操作。准备后可再次执行只读校验确认未漂移，再推送代码和发包。

本地准备记录不表示 npm 已发布，不更新在线可用性；发布失败后保留原记录并可重试相同版本。完整 `.tgz` 和源码发行归档仍可作为 CI 制品/发行附件另行保存。发行序列以本地记录为准，不从 npm latest 猜测；已有正式发行但本地历史缺失时需先由维护者补齐真实基线，不能用空历史重置。实际发布成功与否仍以 npm 为准，客户端仍验证组合内目标版本真实可获取。
