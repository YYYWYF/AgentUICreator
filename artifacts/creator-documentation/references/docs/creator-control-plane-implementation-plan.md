# Creator 开发控制面实现

Creator 是面向 Agent 前端工程的通用 Coding Agent。模型决定检查、编辑和验证的具体顺序；确定性的权限、事务、组合校验与完成证据约束其执行。本文说明当前实现，不定义另一套工作流。

产品与职责边界见 [启动计划](agent-ui-plugin-creator-launch-plan.md)、[插件交付与源码所有权](architecture/npm-default-plugin-source-ownership.md) 和仓库 `AGENTS.md`。发行与进程说明见 [Creator TypeScript 发行](../packages/creator/docs/typescript-distribution.md)。

## 1. 代码与发行职责

用户只安装开发依赖 `@za38.03/agent-ui-creator`。Agent 和内部 Operator 都使用 TypeScript，随同一个 npm 包交付，不需要 Python 或独立 Operator 包。

| 能力 | 当前 owner |
| --- | --- |
| Agent loop、模型、工具和权限判定 | `packages/creator/src/agent/runner.ts`、`tools.ts`、`execution-decision.ts` |
| 已读范围、文件状态与编辑 | `src/agent/project-read.ts`、`files/`、`line-edit.ts` |
| 修改 revision、事务、回执与撤销 | `src/agent/activity.ts`、`src/agent/server.ts` |
| 完成条件与当前证据复核 | `src/agent/outcome.ts`、`validation.ts`、`runtime-evidence.ts` |
| CLI、HTTP 宿主与子进程 | `src/cli.ts`、`standaloneServer.ts`、`CreatorProcessManager.ts` |
| 工程切换与修改互斥 | `src/workspace/CreatorWorkspaceManager.ts` |
| 组合检查、Registry 和项目操作 | `packages/creator/operator/src/project/` |
| 初始化与模板选择 | `operator/src/bootstrap/`、`operator/presets/` |
| npm 更新发现、计划、产物验证与恢复 | `operator/src/updates/`、`src/updates/` |
| 协议和 golden fixtures | `packages/creator/contracts/creator/` |
| Creator UI 与统一文案 | `packages/creator/src/ui/`、`src/ui/i18n/` |

表中缩写路径均相对于 `packages/creator/`。公开项目操作入口为 `/project`、`/project/*`；初始化为 `/bootstrap`，源码目录 Node API 为 `/source-registry`，Mock 为 `/mock-agent`。这些入口均为开发工具，不进入最终前端的生产依赖或浏览器模块图。

## 2. 工程与 Runtime 边界

AppUIModel 拥有生成项目的布局、Plugin 实例身份、启用关系和语义组合。React props、renderer、业务服务与产品外壳属于项目代码，不写入布局 JSON。

通用 AppUIModel 校验/编译、Plugin 生命周期、SlotRegistry、服务注入和应用组装由 `@za38.03/agent-ui-runtime/ui` 交付。正式 Conversation Adapter 仍使用 canonical assistant-ui Runtime，不为某个 Plugin 创建另一条连接。官方 Plugin 默认引用 Plugins npm 实现，项目保留自己的薄应用入口。

初始化只生成所选产品形态的 `application/shell/` 组件与 CSS，通过 `createAgentUIProject({ Shell })` 静态绑定。Runtime 通过 Shell 的 `surfaceRef` 观察实际容器；关闭面板隐藏内容并保持子树挂载。Shell 定制是普通项目代码修改，无需源码接管。

主题、语言、文案、欢迎内容、附件/听写/反馈适配、历史数据源等通过 `Agent` props 传入。服务地址、鉴权和特殊协议适配由项目实现。Host 的数据源覆盖仍要求对应提供插件启用，不绕过 AppUIModel。

## 3. 检查与渐进上下文

模型首轮获得精简的 Plugin 目录，包括身份、启用状态、位置和应用 owner。它是导航事实，不是文件读取或源码接管授权。

- `inspect_ui_project` 检查组合、实例、目录和问题；`detail: "full"` 返回完整检查。
- `inspect_ui_plugin` 获取指定插件的 API、组合与所有权。
- `inspect_ui_edit_context` 聚合 owner、应用源码、样式、实际安装版本 API 和编辑指导。
- `inspect_ui_capabilities` 查询项目能力与已安装 Plugins catalog。
- 通用文件读取、搜索和编辑工具继续可用，不强制专用工具顺序。

同轮 composition 检查只有在工程内容、元数据和安装 catalog 身份一致时才复用；失败不缓存。静态验证只在同轮、同 mode、同修订与内容且此前成功时复用，`force: true` 可重新执行。依赖工程外部可变输入时必须重新验证；build、权限和 Runtime 证据不复用。

连续编辑使用按工程真实路径和会话隔离的进程内工作集，下一轮重新检查权限、owner、安装身份及文件内容后，只预读相关区域。不复用授权、checkpoint 或验证结果。预算不足时关闭缓存并执行原检查，不能用缓存容量限制工程准入。

新请求明确指定另一 Plugin 时，跳过旧 owner 的源码工作集，直接准备新目标；同目标或未指定目标的续改沿用现有新鲜度检查。

历史用户/助手正文使用独立的 `CREATOR_CONTEXT_HISTORY_TOKENS` 估算预算（默认 8000，0 关闭此投影），近期完整轮次优先保留。更早对话的投影按工程 realpath 和线程缓存，最多 64 项、闲置 20 分钟失效；只追加时增量复用，已覆盖前缀变动时失效。摘要标记历史任务、约束来源、结果与未完成事项，不把旧目标当成本轮目标。原始会话及图 checkpoint 保持完整，当前请求保留原文；精确历史通过当前运行重新绑定的 `read_creator_context` 句柄分页回查。缓存不含工具结果、源码证据、审批或验证状态，摘要失败退回原始输入与既有容量处理，取消立即传播。模型输入投影、摘要调用/耗时、预读、模型和工具耗时分别记入现有日志。

## 4. 权限、读后写与事务

结构化权限判定区分当前请求和最近会话；解析失败不授予写权限。文件写入必须使用当前已读范围及内容 hash，保留 LF/CRLF 和相邻行边界。框架、Runtime 和 vendor 不能作为普通插件定制的写入捷径。

`RunActivity` 跟踪本轮实际修改、revision、验证及回执。事务保存在 `.agent-ui/creator/transactions`，撤销前逐文件检查当前内容是否仍等于 after；后续编辑造成冲突时整体拒绝。再次应用同样检查 before，旧验证不能证明重新应用后的工程已通过。

源码接管必须先展示绑定指定 Plugin、实际安装包、文件闭包、实例及工程状态的具体计划，再获得用户同意。普通组件定制和项目薄应用层的存在不构成接管授权。接管和同步的实现范围、BASE 采用条件遵循插件所有权文档。

停用、移除实例与删除源码是不同操作。删除 `plugins/<id>/` 前必须检查全部 AppUIModel 和跨插件引用，并有明确删除授权；停用不删除源码、依赖或基线。

### 快捷命令的受控执行

快捷命令的使用方式见 [公开指南](../../guide/commands.md)。Host 的 `GET /__creator/commands` 与 `POST /__creator/commands/execute` 绑定当前 workspace；运行中或有待答问题时拒绝冲突修改，未知命令不转为普通 Agent 请求。

启停按实例执行，保留原位置、源码、配置和 BASE，不隐式启用父项或接入业务服务。缺失文件/依赖的准备只读，确认绑定 workspace、目标、包/锁状态和受保护文件，有有效期且单次使用；变化后重新准备。只补齐缺失应用文件，不覆盖定制实现。

新增插件的 add 选项交给通用 Creator Agent 检查与组合；发现阶段不运行模型，交接回执不代表已经新增。注册表同步使用项目锁、预期 hash、事务与后置检查；真实 no-op 不生成虚假修改。

命令活动独立于 `agentMessages`，沿用 Creator locale 和回执。失败、恢复、依赖安装、源码事务及 Runtime/视觉验收分别表达，不把一个阶段成功当成全部完成。

## 5. AppUIModel 组合事务

模型使用 `mutate_app_ui_model` 提交语义操作，Host 使用本轮仍有效的权威观察 hash 作为 CAS token。不能以模型提供的任意完整 JSON 覆盖组合。

```text
检查当前工程及权威 AppUIModel hash
  → 获取项目组合锁并恢复待处理事务
  → 在内存应用 operations[]
  → 校验完整 Schema、引用、服务与 Slot 关系
  → 生成 Registry / Capability Catalog 并编译组合
  → 发布所需 artifact 与修订描述
  → 记录真实变更、revision 和回执
```

单个 artifact 与多个 artifact 使用各自的受控发布路径；失败不暴露部分组合。Layout Slot 只保留语义节点，Plugin 挂载关系进入编译结果及 SlotRegistry。完整目录与当前启用组合分开维护；停用项保留可验证的元数据，生产 import 只覆盖实际启用的 Plugin 类型。

初始化模板只提供起点，启动和 npm 升级不能覆盖项目后续修改。维护示例 Host 必须来自 canonical presets 和应用模板；探索性 Creator 测试在独立工程中进行。

## 6. 流、问答、取消与恢复

Agent 的模型调用和图步数没有固定累计上限；LangGraph factory 与共享 streaming runner 显式设置正无穷。调用次数用于遥测，仍保留单次模型超时、取消、无进展检测、权限和显式确认。

`ask_user_question` 在当前线程内中断并恢复执行。Creator 自己的问答与生成前端的 Human Tool、后端 structured interrupt/resume 各自拥有协议，不混用结果。

任务由工程的 Creator 子进程持有，HTTP 连接只是订阅。Host 热更新或页面重载后，面板按线程与任务重连并重放事件，不重复提交修改。`.agent-ui/creator/run-streams` 保存当前进程的订阅重放数据，不提供进程重启后的 checkpoint 恢复。停止按钮显式取消；切换或关闭工程停止旧工程子进程。

## 7. 验证与完成证据

成功答复必须有本轮实际修改、恢复、经过验证的目标条件、受控 no-op 或用户决策等执行证据。`verify_creator_outcome` 只读核对有效启用状态或文件精确文本，收尾时重查；它不授予写权限，也不替代 Runtime 或浏览器验证。

同一未变化修订若连续无证据停止，完成检查最多重试两次；插入只读工具不重置计数，仍无证据则返回 `CREATOR_NO_COMPLETION_EVIDENCE`。这不限制持续有进展任务的累计调用，不把 Creator 变成固定流程。

静态验证、受控 Mock、浏览器交互、真实服务及视觉验收分别表达。验证后再修改文件会使旧证据过期；失败、截断、缺失或 unavailable 不能作为通过。

## 8. 开发预览与运行诊断

最终应用只暴露通用 observability callback 和开发观察事件，不导入 Creator。开发 Host 适配器与 Workbench 连接当前工程、线程的已认证预览通道，转交 Runtime diagnostics 和布局观察；生产构建不加载这些工具适配器。

`inspect_runtime_errors` 读取当前组合相关错误；`inspect_runtime_layout` 请求新采集并按 request ID 有界等待，缓存重放不算本次采集。无效 authoring ref、错误参数和观察超时分别返回原因。Runtime instance ID 与 authoring ref 的对应关系由实际组合检查提供，不能把 DOM nodeId 当作 nodeRef。

布局观察提供几何、语义区域和计算样式：最多 6 个区域、每区 24 个节点、结构预算 18,000 字符，裁剪与不可用明确标记。不接受任意选择器或脚本，不读取页面文字和输入值，不扩大源码权限。几何证据不能替代外观、焦点和真实交互验收。

### Mock 宿主管理

Mock 操作和回放格式见 [Mock 服务](../../mock/index.md) 与 [本地回放](../../mock/local-recordings.md)。Mock 只播放官方预设或当前工程录制数据，不理解 Creator 任务，也不替代真实业务服务。

公开 `@za38.03/agent-ui-creator/mock-agent` 提供官方目录、按 ID 执行、HTTP/Vite 接入与本地数据解析/回放；任意场景执行回调属于内部实现。独立本机服务由 Creator 持有并在退出时清理，预览使用既有连接桥接，不修改生产 endpoint。

工具凭据从 `--config-root` 指定的配置根（默认启动目录）的 `.agent-ui/creator/.env.local` 读取。切换目标工程不切换密钥来源；`CREATOR_*` 保持服务端，不使用 `VITE_` 密钥。场景选择、资源准备和实际运行是不同事实，分别报告结果。项目切换、服务生命周期和资源写入复用当前互斥；详细路由和回放隔离见 [开发连接](architecture/agent-connection-preview-source.md)。

## 9. 检查与剩余边界

在仓库根目录按变更范围运行现有命令：

```sh
pnpm --filter @za38.03/agent-ui-creator typecheck
pnpm --filter @za38.03/agent-ui-creator typecheck:operator
pnpm --filter @za38.03/agent-ui-creator test
pnpm check:operator-contract
pnpm check:i18n
```

Windows 路径、文件 URL、进程解析与退出必须使用跨平台 helper；pnpm 调用使用 `scripts/pnpm-process.mjs`。macOS 上的静态、单元或浏览器结果不等于真实 Windows 验收。

统一更新中心的安装与恢复限定为已有锁文件的独立 npm/pnpm 工程；Creator 工具版本在更新页展示，由实际安装宿主管理升级与重启。已有定制源码保持原结构，实际公开 API 和验证范围以安装包与当前工程为准。

## 按需文档索引

入口定位复用 canonical Plugin ID、实际安装包声明的组件名、统一导航别名与当前工程绑定；精确名称优先，候选排名不选择操作或授予权限。薄应用入口的编辑上下文还关联当前目录声明的文案、结构与样式 owner，以有界源码或精确续读返回；不通过 npm 正向 import 猜测上层配置。可选 Shell 目标必须绑定实际存在的对应文件，不能回退到任意 `Agent.tsx`。

归档先保留安装身份、presentation/composition/localization 合同，再压缩 props 细节；超预算字段给出精确 JSON 路径续读。API 工作快照保留轻量成员名称索引并优先保留当前查询相关签名，不固定截取类型的前四个成员；这些引用仍不授予权限、不更新源码新鲜度。

`inspect_ui_edit_context` 为官方薄应用层和自定义项目 Plugin 提供同一入口：返回实际 owner、definition/manifest 与语义 Slots、实例、Service 依赖、父级组合、已安装公开 API/共享类型及相关文档导航。无 application 元数据的自定义 Plugin 从真实 definition 定位，再跟随本地字面量 import 读取组件、样式和服务契约，不猜测入口必须叫 index.tsx。

可写请求首句明确点名唯一一个已有本地 owner 时，在首个执行模型调用前预取这份上下文；同目标已有新鲜 working set 时沿用既有续改入口。只读问题、名称歧义、多个目标或无本地 owner 均不强制源码预取。该判断只使用当前目录的真实身份与已有名称词汇，不选择修改操作或增加固定任务流程；日志单独记录预取策略、Operator 调用和源码读取数量，避免把自动预取成本混入模型工具次数。

源码采用既有新鲜读取与 hash 校验，单次汇总最多读取 8 个文件、24000 个字符，每文件先读 120 行、最多 6000 字符；未读/截断项在 `coverage.fileNavigation` 提供 `nextRead`，不把有界汇总声称为完整依赖图。包导入与 alias 保留为导航。大型返回通过既有运行内归档按路径回查，汇总不再次截掉已返回的 API 成员；归档摘要保留 owner、服务/Slots、文件与文档入口。定义、manifest 或任一已读源码变动使本次汇总失效并撤销这些读取证据。此机制不授予开发、Service 修改或源码接管权限，也不读取 vendor。 滚动工作上下文在原有 token 预算内优先保留已读组件实现、最近的 Service 契约及实际修改文件；definition/manifest 导航元数据作为回退，不再长期挤掉组件正文。

Creator 的只读核心工具 `read_creator_documentation` 使用随包发布的离线文档，不从目标工程寻找仓库 `docs/`。公开目录由 Website 生成的 `llms.txt` 派生；内部参考的路径、主题和摘要由 `packages/creator/contracts/documentation/references.json` 维护，正文仍以原 `docs/` 文件为唯一 Owner。人可阅读的入口为包内 `dist/documentation/creator-index.md`。

- `action=index` 无筛选时返回主题与数量；通过 `query`、`source` 或 `topic` 获取每页 8 条目录，`documentId` 可限定已知文档。检索支持完整 API 路径与成员片段；主 `nextRead` 直达最佳匹配小节，整篇目录保留为 `tableOfContents`，命中摘要不代替正文证据。已知 Plugin 的编辑上下文优先给出该 Plugin 的具体小节，再附相关全局参考。
- `action=read` 加 `documentId` 返回章节目录，每页 32 条；再加 `sectionId` 才读取正文，默认 4000、最多 8000 个 UTF-16 单元，使用 `nextOffset` 续读，不拆开 Unicode 代理对。
- 安装、启动、构建、打包、验包和发布不校验 documentation；可选的静态资源存在时原样复制，缺失时跳过。Agent 按需读取文档时独立处理内容和读取错误。
- 结果标明 Creator 文档版本与 `referenceOnly`；目标项目的实际文件及安装包声明仍是编辑依据。文档读取不登记源文件观察、不授予开发或源码接管权限。更换关键词但没有找到新文档，不算调查进展。

此入口供通用 Agent 按任务使用，不增加固定工作流、累计调用上限或新的模型摘要步骤。随包文档缺失、被改动或无法读取时明确报告，不能据此断言功能不存在。
