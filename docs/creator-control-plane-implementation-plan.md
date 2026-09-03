# Creator 开发控制面实施计划

> 状态：Approved design companion / Phase 1–6 已实施；Phase 0 自动化基线完成、HMR 对照待补；Phase 7–9 待实施
>
> 设计依据：[Agent UI Plugin Creator 最终设计与启动计划](./agent-ui-plugin-creator-launch-plan.md) 与仓库根目录 `AGENTS.md`。本文负责把最终设计落实为可执行的工程阶段，不建立新的产品架构。

## 1. 实施目标

本轮改造把 Creator 从“具有受限文件写权限的 Coding Agent”升级为：

> 能准确观察目标 UI 项目、通过事务语义修改 AppUIModel、确定性维护生产 Registry、区分停用与删除、读取运行时诊断，并用当前 revision 的证据完成交付的 UI Coding Agent。

改造后仍保持：

- Creator 是通用 Coding Agent，不是固定 Workflow；
- AppUIModel 是 UI 组合唯一事实源；
- Plugin 源码属于生成项目和用户；
- UI Runtime 确定性渲染，不承担 AI 判断；
- 生产 Registry 使用显式静态 import；
- 目标项目不依赖 `@agent-ui/creator`，可独立 `dev`、`test`、`typecheck`、`build`；
- Creator 不规定目标项目使用 Ant Design、MUI、Tailwind 或任何 major version。

## 2. 非目标

本计划不实施：

- DeepSeek/Cordis 动态 Package Runner；
- 生产环境动态安装或任意路径 import Plugin；
- Plugin Marketplace；
- 通用 Slot Capability 类型系统；
- 多页面或多 Agent Runtime；
- Creator 自动视觉验收；
- 为了热插拔预先重写生产加载链；
- Tool、Skill、Runtime 或 Model Plugin Creator。

## 3. 当前基线

### 3.1 已具备能力

当前代码已经具备后续改造应复用的基础：

| 能力 | 当前位置 | 实施策略 |
| --- | --- | --- |
| AppUIModel Zod 与跨字段校验 | `examples/agent-frontend/framework/contracts/app-ui-model.ts` | 继续作为目标项目事实源，不在 Creator 复制 Schema |
| Plugin Contract 与 Service 生命周期 | `framework/contracts/ui-plugin.ts`、`runtime/plugins/PluginServiceRuntime.ts` | 保留，不引入动态 Package 模型 |
| Creator 文件和命令权限 | `packages/creator/src/ProjectCreatorBackend.ts`、`createCreatorAgent.ts` | 在此基础上增加观察版本和领域工具 |
| mutation revision 与修改回执 | `CreatorActivityRecorder.ts` | 扩展为稳定 run id、hash、删除和事务记录 |
| Verified Completion Gate | `CreatorCompletionGate.ts` | 保留，并增加 Registry freshness 与 runtime diagnostics 证据 |
| AG-UI 流、压缩快照和新会话 | `CreatorAgUiAdapter.ts`、`CreatorWorkbench.tsx` | 复用流通道承载澄清交互 |
| 本地 JSONL 诊断日志 | `CreatorRunLogger.ts` | 与 transaction journal 分开保存 |
| Plugin Error Boundary | `runtime/plugins/PluginErrorBoundary.tsx` | 增加开发期结构化上报出口 |

### 3.2 已知基线问题

`mount === undefined` 现在明确表示没有普通 UI mount；只有带 `mount` 的普通 UI Plugin 或声明为 headless 的 Plugin 会进入 activation graph。实施人员不得为了让检查通过擅自删除实例或 Plugin 源码。

### 3.3 工作树保护

当前仓库存在未提交的功能改动。开始每个阶段前必须：

1. 记录 `git status --short`；
2. 只修改该阶段列出的文件；
3. 不 reset、checkout、stash 或重排无关改动；
4. 将已有失败与本阶段新增失败分别记录；
5. 对与已有改动重叠的文件先读完整 diff，再做最小增量编辑。

## 4. 目标数据流

### 4.1 每次 Creator run

```text
用户请求
  ↓
读取 compact ProjectSnapshot
  ↓
通用 Coding Agent 自主判断
  ├─ 精确 inspect
  ├─ 编辑 Plugin 源码
  ├─ 事务式修改 AppUIModel + Registry
  ├─ 必要时询问一个用户侧问题
  └─ 读取 runtime diagnostics
  ↓
verify:ui + typecheck（绑定最新 mutation revision）
  ↓
同模型根据真实 diff 与证据复核
  ↓
最终答复 + receipt + undo run id
```

### 4.2 组合事务

```text
expectedAppUIModelHash
  ↓
获取项目内组合事务锁
  ↓
读取并验证当前 AppUIModel
  ↓
在内存应用 operations[]
  ↓
完整 Schema / 关系校验
  ↓
根据全部 PluginInstance 生成 Registry source
  ↓
计算结构化 diff
  ↓
原子写 app-ui.json + registry.generated.ts
  ↓
记录 before content / after hash / mutation revision
```

失败时两个文件都保持修改前内容，不允许只写成功一半。

### 4.3 运行时诊断

```text
Plugin Error Boundary / setup failure
  ↓
开发期 DiagnosticReporter
  ↓
Creator Vite middleware 的有界缓冲区
  ↓
inspect_runtime_errors
  ↓
Creator 修复源码或组合
```

生产构建不启用 reporter endpoint，Plugin Runtime 也不能依赖 Creator package。

## 5. 核心接口

下面的类型是实施目标，可在编码时按现有 TypeScript 约定拆分，但不能改变语义。

### 5.1 ProjectSnapshot

```ts
interface CreatorProjectSnapshot {
  schemaVersion: 1
  appUIModel: {
    hash: string
    version: string
    layout: CompactLayoutNode
    slots: Array<{
      slotId: string
      nodeId: string
      nodePath: string
      mounts: Array<{
        instanceId: string
        pluginId: string
        enabled: boolean
        order?: number
      }>
    }>
  }
  pluginInstances: Array<{
    id: string
    pluginId: string
    enabled: boolean
    mount?: { slotId: string; order?: number }
    mountedSlotId?: string
  }>
  registry: {
    selectedPluginIds: string[]
    generatedFileFresh: boolean
    issues: ProjectIssue[]
  }
  pluginAssets: Array<{
    pluginId: string
    directory: string
    selected: boolean
    capabilities: string[]
  }>
  catalogs: Array<{ id: string; path: string }>
  uiStack: Array<{ packageName: string; version: string }>
  evidence: {
    mutationRevision: number
    lastValidation?: RevisionEvidence
    lastRuntimeDiagnostic?: RevisionEvidence
  }
}
```

约束：

- 默认序列化结果设置明确字节上限；
- Layout 只返回导航需要的节点 id、type、尺寸和层级，不展开任意 props；
- 精确 manifest、组件源码和完整 props 仍通过专项 inspect 获取；
- `lastValidation` 与 `lastRuntimeDiagnostic` 必须标记 `current: boolean`，不能暗示旧证据仍有效。

### 5.2 AppUIModel 操作

模型侧只暴露一个事务工具 `mutate_app_ui_model`，内部使用 discriminated union，避免把十几个独立工具塞进固定 Tool Catalog：

```ts
interface MutateAppUIModelInput {
  expectedAppUIModelHash: string
  operations: AppUIOperation[]
}

type AppUIOperation =
  | AddInstanceOperation
  | UpdateInstancePropsOperation
  | SetInstanceEnabledOperation
  | MountInstanceOperation
  | UnmountInstanceOperation
  | MoveInstanceOperation
  | ReplaceInstanceOperation
  | RemoveInstanceOperation
  | InsertLayoutNodeOperation
  | UpdateLayoutNodePropsOperation
  | MoveLayoutNodeOperation
  | ReplaceLayoutNodeOperation
  | RemoveLayoutNodeOperation
```

关键行为：

- `update_instance_props` 使用显式 `set` 与 `removeKeys`，不接受含糊的递归 merge；
- `mount_instance` 指定 `slotId` 和可选插入位置；
- `move_instance` 在一个操作内完成旧 Slot 卸载和新 Slot 挂载；
- `replace_instance` 保证新实例建好并挂载后才删除旧实例；
- 删除带已挂载实例的 Layout 子树时，若同一 transaction 没有处理受影响实例则拒绝；
- 任一中间状态可以暂时不完整，但 operations 全部应用后的最终模型必须完整有效；
- enabled 的非 headless 实例最终必须被挂载；disabled 实例允许未挂载；
- 工具结果返回新 hash、revision、归一化 operations、模型 diff、Registry diff 和 warnings。

### 5.3 Registry generator

目标项目提供纯函数和 CLI 两层：

```ts
interface GenerateRegistryResult {
  source: string
  selectedPluginIds: string[]
  assets: PluginAsset[]
  issues: ProjectIssue[]
}

generatePluginRegistry(projectRoot, appUIModel): Promise<GenerateRegistryResult>
```

生成规则：

1. 从 `pluginInstances` 收集全部唯一 `pluginId`，不按 enabled 或挂载状态过滤；
2. 扫描一级 `plugins/*/manifest.json` 建立 id 到目录映射；
3. 要求被选中目录包含 `definition.ts`；
4. 生成按 plugin id 稳定排序的 default imports；
5. import 本地变量使用 `pluginDefinition0` 这类生成名，避免把 plugin id 直接转换为标识符；
6. 输出 `plugins/registry.generated.ts`；
7. `plugins/index.ts` 只 re-export `pluginDefinitions`；
8. 未选择资产和 Catalog 不写入生成文件。

`registry.generated.ts` 纳入版本控制。`generate:registry` 是显式开发命令；`verify:ui`、`typecheck` 和 `build` 只检查或消费现有生成物，不在执行时修改工作树。

### 5.4 事务与撤销记录

```ts
interface CreatorTransactionRecord {
  schemaVersion: 1
  runId: string
  createdAt: string
  mutationRevision: number
  files: Array<{
    path: string
    before: { exists: boolean; content?: string; hash?: string }
    after: { exists: boolean; hash?: string }
  }>
  verificationStatus: "pending" | "passed" | "failed"
}
```

存放位置：

```text
.agentuicreator/transactions/<runId>.json
```

安全约束：

- 仅记录本 run 实际修改且位于授权范围内的文件；
- `.agentuicreator` 保持本地 ignore，不上传；
- undo 在写入前逐个验证当前文件等于 after 状态；
- 任意目标冲突则整体拒绝，不做部分撤销；
- 撤销本身形成一个新 run 和新 transaction，可再次审计；
- 删除源码的 before 内容也必须可恢复，但要设置单 run 大小上限，超限则删除工具拒绝执行。

### 5.5 RuntimeDiagnostic

```ts
interface RuntimeDiagnostic {
  id: string
  kind: "render" | "activation" | "tagged-console"
  level: "error" | "warning"
  message: string
  stack?: string
  pluginId?: string
  instanceId?: string
  slotId?: string
  appUIModelHash: string
  mutationRevision?: number
  occurredAt: string
  lastSeenAt: string
  count: number
}
```

同一 `{kind, pluginId, instanceId, message, appUIModelHash}` 去重累计；缓冲区必须限制条数、单条大小和存活时间。

`appUIModelHash` 统一定义为 `app-ui.json` 精确 UTF-8 字节的 SHA-256。目标应用在开发构建中从同一原始 JSON source 获得该值，避免 Creator、验证器和浏览器各自对对象做不同的序列化。Plugin 源码等其他文件使用各自的 observed content hash，不复用该字段。

### 5.6 ask_creator_user

```ts
interface AskCreatorUserInput {
  id: string
  header?: string
  question: string
  options?: Array<{ label: string; description?: string }>
}
```

第一版限制：

- 普通 run 最多调用一次；
- 每次只允许一个短问题；
- 只问检查项目无法回答的用户意图、创意偏好或破坏性确认；
- 问题通过 AG-UI `CUSTOM` 事件发送，Workbench 使用独立 answer endpoint 回答；
- 原 `/__creator/run` 流保持打开，答案作为普通 Tool result 回到同一 Agent loop；
- 页面刷新、用户新建会话、run abort 或连接关闭都会取消 pending question；
- 不使用问题工具询问文件位置、现有代码行为或其他可检查事实。

## 6. 分阶段实施

阶段按依赖顺序执行。每个阶段都必须独立通过本阶段测试后再进入下一阶段。

### Phase 0：建立干净、可归因的基线

目标：确认当前验证结果和未提交改动，不让旧故障污染后续验收。

实施状态（2026-09-02）：自动化基线已恢复并通过；HMR 四场景对照尚未执行，保留到进入 HMR 策略阶段前补齐。

任务：

1. 与项目所有者确认 `agent-conversations-main` 应挂载还是禁用；
2. 用最小 AppUIModel 改动恢复 `verify:ui` 绿线；
3. 运行并记录目标项目 `verify:ui`、`typecheck`、`test`、`build`；
4. 运行并记录 Creator package `typecheck`、`test`、`build`；
5. 将环境或依赖造成的基线失败与代码失败分开记录；
6. 保存 HMR 四种场景的当前行为，作为 Phase 8 对照组。

验收：

- 基线失败全部有归属；
- 没有通过删除 Plugin 源码或放宽验证器来消除错误；
- 后续阶段可以明确指出新增或消除的失败。

### Phase 1：目标项目 Control Core 与 Registry 生成器

目标：先让目标项目自身能够纯计算快照、验证资产并生成静态 Registry，尚不接入模型工具。

实施状态（2026-09-02）：已完成。目标项目可独立生成、只读验证、typecheck、测试和生产构建；Phase 2 已通过固定控制入口将这些观察能力接入 Creator。

建议新增：

```text
examples/agent-frontend/scripts/ui-project/types.ts
examples/agent-frontend/scripts/ui-project/project-inspector.ts
examples/agent-frontend/scripts/ui-project/project-config.ts
examples/agent-frontend/scripts/ui-project/plugin-assets.ts
examples/agent-frontend/scripts/ui-project/registry-generator.ts
examples/agent-frontend/scripts/generate-plugin-registry.ts
examples/agent-frontend/plugins/registry.generated.ts
examples/agent-frontend/tests/plugin-registry-generator.test.ts
examples/agent-frontend/tests/project-inspector.test.ts
```

建议修改：

```text
examples/agent-frontend/plugins/*/definition.ts
examples/agent-frontend/plugins/index.ts
examples/agent-frontend/scripts/verify-ui.ts
examples/agent-frontend/package.json
```

实施步骤：

1. 为现有每个 Plugin definition 增加 default export，保留 named export；
2. 实现 Plugin asset 扫描与重复 id、缺文件诊断；
3. 用目标项目显式 `project-config.ts` 声明开发期 Catalog 与 `_shared` 等非 Plugin 目录路径，不通过目录名猜测；
4. 实现纯 Registry source generator，并用 TypeScript AST 而非正则确认 selected definition 具有 default export；
5. 生成初始 `registry.generated.ts`，让 `plugins/index.ts` 稳定 re-export；
6. 增加 `pnpm generate:registry`；
7. 改写 `verify:ui`：直接复用 generator 的纯计算结果，比较期望源码与磁盘源码；
8. 删除当前对 `plugins/index.ts` 的正则 AST 猜测；
9. 验证未选择源码与 Catalog 只是资产，不产生错误。

测试矩阵：

- selected instance 生成 import；
- disabled、未挂载 instance 仍生成 import；
- headless instance 生成 import且不要求 Slot；
- 最后一个实例移除后 import 消失；
- 两个实例共享 plugin id 时只生成一次；
- duplicate manifest id 失败；
- selected manifest/definition 缺失失败；
- stale generated file 让 `verify:ui` 失败但不改文件；
- Catalog 和 unselected asset 不进入输出；
- 连续生成两次字节完全一致。

退出标准：

- 应用生产 import graph 只包含当前 AppUIModel 选中的 definitions；
- `verify:ui` 全程只读；
- `registry.generated.ts` 已提交，`typecheck` 和 `build` 不触发 codegen；
- 克隆目标项目后不需要 Creator package 即可生成、验证、构建。

### Phase 2：ProjectSnapshot 与渐进 Inspect

目标：让 Creator 每个 run 都有可靠导航信息，同时保留按需读取能力。

实施状态（2026-09-02）：已完成。固定 JSON 控制入口、Creator Adapter、12,000 字符上限的 run 快照、四个渐进 inspect 工具、revision/validation freshness 元数据和缺失/不兼容诊断均已接入；Runtime diagnostics 明确标记为尚不可用，留待 Phase 6。

建议新增：

```text
packages/creator/src/project-control/ProjectControlAdapter.ts
packages/creator/src/project-control/projectSnapshot.ts
packages/creator/src/project-control/creatorProjectTools.ts
packages/creator/src/project-control/types.ts
packages/creator/tests/project-control-adapter.test.ts
packages/creator/tests/creator-project-tools.test.ts
```

目标项目增加固定 JSON 控制入口：

```text
examples/agent-frontend/scripts/ui-project-control.ts
```

实现边界：

- Creator Adapter 只能调用固定入口并通过 stdin/stdout 交换经过 Schema 校验的 JSON；
- 模型不能提供 executable、shell command 或任意 script path；
- 目标入口复用 Phase 1 的 inspector 和 generator，不复制逻辑；
- `inspect_ui_project` 合并目标项目结构数据与 Creator 自己保存的 revision/validation/diagnostic 元数据；
- run 首次模型调用在稳定 system prompt 之后追加 compact snapshot；
- `inspect_app_ui_model`、`list_ui_plugins`、`inspect_ui_plugin` 返回精确信息并设置大小上限。

需要修改：

```text
packages/creator/src/createCreatorAgent.ts
packages/creator/src/createProjectCreatorSession.ts
packages/creator/src/CreatorAgUiAdapter.ts
packages/creator/src/prompt/system.ts
packages/creator/src/index.ts
```

测试矩阵：

- Slot、instance、mount path 和 headless 状态准确；
- Registry stale 状态准确；
- UI 栈版本来自目标 `package.json` / lockfile 可用信息，而非猜测；
- 超大 props 和大量 assets 不突破快照上限；
- 最近验证 revision 不匹配时标记为 stale；
- 目标控制入口缺失或版本不兼容时给出可诊断错误，不回退到猜测。

退出标准：

- “右侧面板”“历史会话组件”等模糊引用可以从快照定位；
- 模型无需每轮 `ls + grep + read` 才知道基本组合；
- 目标项目仍不依赖 Creator。

### Phase 3：事务式 AppUIModel 语义修改

目标：用一个原子 transaction 维护 AppUIModel 与 Registry，不再让模型手工编辑组合 JSON 和 Registry。

实施状态（2026-09-02）：已完成。`mutate_app_ui_model` 已通过目标项目固定控制入口接入 Creator，支持 13 类实例、挂载与 Layout Tree 语义操作；提交前执行精确 hash、完整 AppUIModel、visual/headless 挂载和静态 Registry 校验。AppUIModel 与 Registry 使用项目内 journal、临时文件和 rename 提交，下一次控制入口可完成中断事务，外部文件冲突时拒绝覆盖。Creator Activity 仅按真实 `changedPaths` 记录 revision 与 diff，no-op 不产生 revision；prompt 与内置 skills 已切换到领域工具优先。

目标项目建议新增：

```text
examples/agent-frontend/scripts/ui-project/app-ui-operations.ts
examples/agent-frontend/scripts/ui-project/app-ui-transaction.ts
examples/agent-frontend/tests/app-ui-operations.test.ts
examples/agent-frontend/tests/app-ui-transaction.test.ts
```

Creator 建议新增：

```text
packages/creator/src/project-control/appUIModelTool.ts
packages/creator/tests/app-ui-model-tool.test.ts
```

实施步骤：

1. 为 Layout Tree 建立稳定 node index：`nodeId -> path / parent / child index`；
2. 实现全部 discriminated operations；
3. 每个 transaction 开始时验证 `expectedAppUIModelHash`；
4. 对 projectRoot 级组合写入加进程内互斥锁；
5. 在内存完成 model parse、关系校验与 Registry generation；
6. 捕获两个目标文件 before 状态；
7. 先写 transaction journal 和两个临时文件，再依次 rename；普通失败时恢复 before，进程异常退出后由下一次控制入口根据未完成 journal 恢复或完成提交；
8. Adapter 把实际 changed paths 交给 `CreatorActivityRecorder`，只对真实变化递增 revision；
9. 工具返回结构化 diff 与新 snapshot token；
10. 从 prompt/skill 中取消“直接手改 app-ui.json / plugins/index.ts”的首选指导。

并发与失败测试：

- expected hash stale 时无文件变化；
- operation 中途失败时无文件变化；
- Registry 生成失败时 AppUIModel 不落盘；
- 第二个并发 transaction 串行化并重新检查 hash；
- no-op operation 不递增 revision；
- multi-operation 可从一个有效状态原子到另一个有效状态；
- enabled visual instance 未挂载的最终状态被拒绝；
- headless 和 disabled 最终状态被接受；
- JSON 格式稳定且不重排无关语义。

退出标准：

- 普通布局、挂载、停用、移除和替换请求不需要模型直接编辑 AppUIModel；
- AppUIModel 与 Registry 不会出现半提交；
- Completion Gate 能看到领域工具造成的准确 revision 和 diff。

### Phase 4：文件观察策略、run transaction 与安全 Undo

目标：保护用户并发修改，并让一次 Creator run 可以安全恢复。

实施状态（2026-09-02）：已完成。CLI Session 与 AG-UI 现在把同一个字符串 run id 交给 Activity、诊断日志和 transaction；通用 Plugin 文件编辑执行 run 内 read-before-edit/read-before-overwrite、hash freshness 检查以及同目录临时文件提交，新文件使用不覆盖创建。每个有净变化的成功、失败或中止 run 都持久化有大小和文件数上限的 before/after transaction，回执公开 run id 与实时可撤销状态。`undo_creator_run` 在零写入 preflight 后恢复 created/modified/deleted 文件，普通中途失败会回滚已恢复部分，并自动执行 `verify:ui` 与 typecheck；撤销本身形成独立 transaction，可继续安全恢复。Workbench 已显示撤销身份和冲突保护提示。

建议新增：

```text
packages/creator/src/files/CreatorFileObservationStore.ts
packages/creator/src/transactions/CreatorTransactionStore.ts
packages/creator/src/transactions/creatorUndoTool.ts
packages/creator/tests/creator-file-observation.test.ts
packages/creator/tests/creator-transaction-store.test.ts
packages/creator/tests/creator-undo-tool.test.ts
```

建议修改：

```text
packages/creator/src/ProjectCreatorBackend.ts
packages/creator/src/CreatorActivityRecorder.ts
packages/creator/src/receiptTypes.ts
packages/creator/src/createProjectCreatorSession.ts
packages/creator/src/CreatorAgUiAdapter.ts
packages/creator/src/ui/CreatorWorkbench.tsx
```

实施步骤：

1. 统一 CLI 与 AG-UI run id；`activity.begin(runId)` 不再自行使用独立序号作为身份；
2. 对 `read` / `readRaw` 记录文件存在状态和内容 hash；
3. `edit` 必须已有 positive observation；覆盖已有文件的 `write` 必须有 observation；
4. 写入前重新计算 hash，变化则返回 stale-version；
5. ActivityRecorder 支持 created、modified、deleted 三种 receipt；
6. run 结束时持久化 transaction record；
7. 回执显示可撤销 run id 和是否仍可撤销；
8. `undo_creator_run` 先完整检查所有 after hashes，再整体恢复；
9. undo 后自动运行当前要求的验证，并生成独立回执。

边界说明：普通编辑器不会参与 Creator 的锁，因此无法承诺跨进程无竞态的文件系统 CAS；实现应在真正写入前做 hash freshness check，并使用同目录临时文件 + rename 缩小竞态窗口。发现冲突时宁可拒绝，也不覆盖用户修改。

测试矩阵：

- 未读 edit 被拒绝；
- 读后外部改动导致 stale-version；
- 新文件 guarded create 不覆盖并发创建；
- 同 run 多次修改只保存首次 before 与最终 after；
- no-net-change 不生成可撤销 transaction；
- after hash 完整匹配时 undo 成功；
- 任意一个目标冲突时 undo 零写入；
- 创建文件、修改文件和受控删除都能恢复；
- 超出 journal 大小上限时破坏性工具提前拒绝。

退出标准：

- Creator 不再无条件覆盖未观察文件；
- 用户或其他任务继续编辑后，undo 不会抹掉其成果；
- 不依赖 Git 工作树是否干净。

### Phase 5：停用、移除、替换与受限源码删除

目标：把用户语言映射成安全、明确的领域语义。

实施状态（2026-09-02）：已完成并保持真实会话关闭。Prompt 与内置 skills 已把隐藏、移除实例、替换和永久删除源码映射为四种不同语义；前三种继续由 Phase 3 的 AppUIModel transaction 完成并默认保留源码。目标项目新增基于自身 TypeScript 7 project/checker 的跨 Plugin、services、app source 模块解析，以及 plugin id literal/manifest 保守检查。Creator 的受限删除执行器只接受 host 侧为当前 run 与精确 plugin id 提供的可信授权，并依次拒绝仍有实例、Registry 非新鲜、源码引用、非单目录路径、链接/特殊文件、不可无损恢复的二进制文件和 journal 超限；合法文本源码删除自动验证且可由 run transaction 完整恢复。`delete_ui_plugin_source` 目前没有加入真实 Creator Tool Catalog，`CREATOR_PLUGIN_SOURCE_DELETE_ENABLED_BY_DEFAULT` 固定为 `false`；待 Phase 7 同 run 用户确认 token 接入后才允许 host 显式启用。

普通语义通过 Phase 3 operations 完成：

- 隐藏：`unmount_instance + set_instance_enabled(false)`；
- 移除功能：`unmount_instance + remove_instance`；
- 替换：`add/mount new + unmount/remove old` 的单 transaction；
- 源码保留是默认行为。

源码删除建议新增：

```text
packages/creator/src/project-control/deleteUIPluginSourceTool.ts
packages/creator/tests/delete-ui-plugin-source-tool.test.ts
```

Phase 5 完成删除 preflight、transaction 和测试，但 `CREATOR_PLUGIN_SOURCE_DELETE` 保持关闭；等 Phase 7 的同 run 确认通道完成后再对真实 Creator 会话启用。

删除前置检查：

1. 用户当前请求明确写出删除代码，或本 run 有有效 `ask_creator_user` 确认 token；
2. AppUIModel 中没有该 plugin id 的实例；
3. 生成 Registry 中没有该 plugin id；
4. 使用 TypeScript compiler/module resolution 检查其他 Plugin、services、app source 中没有指向该目录或其导出的引用，并补充对 manifest id 字符串引用的保守检查；
5. 目标精确解析为 `plugins/<one-directory>`，禁止 glob 和父目录；
6. transaction journal 能在大小限制内保存全部删除内容；
7. 删除后 `verify:ui` 与 typecheck 必须通过，否则 Completion Gate 不允许成功答复。

需要同步更新：

```text
packages/creator/src/prompt/system.ts
packages/creator/skills/app-ui-model/SKILL.md
packages/creator/skills/ui-plugin-development/SKILL.md
packages/creator/skills/ui-debugging/SKILL.md
```

测试矩阵：

- “不要显示”不删 instance/source；
- “移除功能”删 instance 不删 source；
- 替换保留旧源码；
- 普通 delete backend 仍拒绝；
- 无授权、仍被引用、路径逃逸、journal 超限均拒绝源码删除；
- 合法源码删除可通过 undo 完整恢复。

退出标准：

- 模型无需猜“移除”是否意味着销毁；
- 任意文件删除能力仍未开放；
- 源码删除具备明确授权、引用证明和可恢复性。

### Phase 6：运行时诊断桥

目标：覆盖“typecheck 通过但页面渲染/激活失败”的盲区。

目标项目建议新增或修改：

```text
examples/agent-frontend/runtime/diagnostics/types.ts
examples/agent-frontend/runtime/diagnostics/PluginDiagnosticContext.ts
examples/agent-frontend/runtime/plugins/PluginErrorBoundary.tsx
examples/agent-frontend/runtime/plugins/UIPluginRuntime.tsx
examples/agent-frontend/runtime/plugins/PluginServiceRuntime.ts
examples/agent-frontend/src/App.tsx
examples/agent-frontend/tests/plugin-runtime-diagnostics.test.tsx
```

Creator 建议新增或修改：

```text
packages/creator/src/runtime-diagnostics/CreatorRuntimeDiagnosticStore.ts
packages/creator/src/runtime-diagnostics/runtimeDiagnosticTool.ts
packages/creator/src/vitePlugin.ts
packages/creator/src/createCreatorAgent.ts
packages/creator/tests/creator-runtime-diagnostics.test.ts
apps/creator-workbench/src/main.tsx
```

实施步骤：

1. 在 App 启动时计算当前 AppUIModel hash；
2. Runtime 从 Layout index 获得 instance 对应 Slot；
3. Error Boundary 上报 render failure、component stack、plugin/instance/slot/hash；
4. PluginServiceRuntime 将 activation failed 通过回调上报；
5. 目标 `App` 和 UI Runtime 只暴露可选的通用 `onRuntimeDiagnostic` callback，不知道 Creator endpoint；
6. `apps/creator-workbench` 作为同时依赖 Creator 与目标项目的开发组合层，把 Creator-owned reporter callback 传给目标 `App`；
7. 只有 Creator-owned reporter 通过独立 endpoint 把诊断发送给 Vite middleware；
8. middleware 有界、去重、按 project/thread 隔离保存；
9. `inspect_runtime_errors` 默认只返回当前 hash 的诊断，可显式查看 stale 历史；
10. 成功重渲染或 hash 更新后，旧错误标记 resolved/stale，不直接删除审计信息；
11. 独立目标应用不传 callback，生产 bundle 不导入 Creator、Creator endpoint 或 Creator reporter。

测试矩阵：

- render error 可定位 plugin、instance、slot；
- setup error 可定位 instance；
- 同一错误重复只累加 count；
- 不同 AppUIModel hash 不混为当前错误；
- reporter endpoint 不可用时应用仍正常运行；
- standalone target 和 production bundle 不包含 Creator endpoint 或 package import；
- 只有 workbench composition shell 负责连接 target callback 与 Creator reporter；
- 普通无来源 console error 不被错误归因。

退出标准：

- Creator 能修复至少一个静态验证捕获不到的真实渲染错误；
- runtime diagnostics 可作为当前 revision 的辅助证据，但不替代 typecheck / verify:ui。

实施状态（2026-09-02）：已完成。目标 Runtime 以可选 callback 上报带 AppUIModel SHA-256、PluginInstance、Slot 路径和 component stack 的 render/setup 诊断；Workbench 作为唯一组合层连接 Creator-owned reporter，Vite middleware 按 project/thread 有界去重并保留 resolved/stale 审计，Creator 已接入 `inspect_runtime_errors` 和每轮摘要。测试覆盖错误定位、恢复、重复计数、hash/thread 隔离、端点不可用和普通 console error 不归因；独立生产构建已确认不包含 Creator package 或 `/__creator/` endpoint 字符串。静态验证仍保持独立门禁。

### Phase 7：同 run 澄清通道

目标：只在用户拥有答案的歧义或破坏性确认上暂停，并在同一 Agent loop 继续。

建议新增：

```text
packages/creator/src/user-questions/CreatorUserQuestionBroker.ts
packages/creator/src/user-questions/creatorAskUserTool.ts
packages/creator/src/user-questions/types.ts
packages/creator/tests/creator-user-questions.test.ts
```

建议修改：

```text
packages/creator/src/CreatorAgUiAdapter.ts
packages/creator/src/vitePlugin.ts
packages/creator/src/shared.ts
packages/creator/src/ui/CreatorWorkbench.tsx
packages/creator/src/ui/creator-workbench.css
packages/creator/src/prompt/system.ts
```

传输设计：

- pending question 由 broker 以 `{threadId, runId, requestId}` 定位；
- AG-UI 流发送 `CUSTOM` 事件 `creator.user-question.requested`；
- Workbench 渲染 options 与自由输入；
- 独立 POST answer endpoint 提交 `{requestId, answers}`；
- broker 只接受第一个匹配答案并 resolve tool promise；
- abort、断线、新建会话和重复答案都得到确定结果；
- 答案进入 ToolMessage，现有 AG-UI 历史保存和压缩继续工作。

测试矩阵：

- tool 等待后在同一 run 收到答案并继续；
- 错误 thread/run 的答案被拒绝；
- 重复答案幂等或明确冲突；
- abort 释放 promise 和 broker 状态；
- 页面刷新不会留下永远 pending 的调用；
- 同 run 第二次普通澄清被拒绝；
- 源码删除确认可以生成仅限本 run、仅限目标 plugin id 的 authorization token。

退出标准：

- Creator 不需要用最终答复冒充澄清；
- 普通明确请求不会增加多余询问；
- 源码删除具备可验证的同 run 用户确认。

### Phase 8：完成门禁、技能与 Workbench 收口

目标：让所有新能力进入一致的证据链和用户体验。

实施事项：

1. Completion Gate 继续自动运行 `pnpm verify:ui` 与 `pnpm typecheck`；
2. 验证结果写入 Creator project state，带 run id、revision 和 AppUIModel hash；
3. 验证后发生任何写入即让结果失效；
4. 完成复核证据增加 Registry freshness、runtime diagnostics 摘要和 undo availability；
5. Workbench 回执展示当前/过期证据，不把旧 runtime error 当成当前失败；
6. 更新所有 Creator skills，删除手工注册表和一刀切“不得删除 Plugin”的旧指导；
7. System prompt 保持短小，只保留角色、边界、Inspect-first 与安全语义；
8. 用真实模糊请求验证 Agent 会先使用快照而非猜测；
9. model name 改为 host 配置允许值，但保持 provider、endpoint 与配置文件归 Creator host 所有；
10. 不因模型可配置而把模型 SDK 或配置写入生成项目。

建议修改：

```text
packages/creator/src/CreatorCompletionGate.ts
packages/creator/src/CreatorActivityRecorder.ts
packages/creator/src/receiptTypes.ts
packages/creator/src/modelConfig.ts
packages/creator/src/ui/CreatorWorkbench.tsx
packages/creator/src/prompt/system.ts
packages/creator/skills/*/SKILL.md
packages/creator/tests/creator-completion-gate.test.ts
packages/creator/tests/creator-model-config.test.ts
```

验收场景：

1. “右边增加工具详情”：快照定位布局，必要时创建 Plugin，事务增加实例和 Slot，Registry 自动生成；
2. “右边太宽”：只修改 Layout，无 Plugin source diff；
3. “这个先不要显示”：unmount + disabled，源码保留；
4. “移除这个功能”：instance 消失，最后一个实例时 Registry import 消失，源码保留；
5. “换成历史会话”：Creator 通过快照定位候选，新旧实例在一个 transaction 中替换；
6. “代码也删掉”：若原请求没有明确范围则询问一次，确认后受限删除；
7. 人工在 Creator 读取后修改同一文件：Creator stale-version 拒绝覆盖；
8. 撤销前人工又修改文件：undo 整体拒绝；
9. Plugin render throw：typecheck 通过但 runtime diagnostics 使 Creator 能定位并修复；
10. AppUIModel 手工修改但忘记 generate：`verify:ui` 报 Registry stale 且不写文件。

退出标准：

- receipt 中每条“通过”都能追溯到当前 revision/hash；
- 目标项目的独立 build 不包含 Creator；
- 通用 Agent 仍可自由读代码、编辑 Plugin 和选择工具，没有固定节点 Workflow。

### Phase 9：HMR 实测后的条件性改进

这一阶段不是默认编码任务。先重跑 Phase 0 的 HMR 对照矩阵：

| 变更 | 期望最低行为 | 重点观察 |
| --- | --- | --- |
| Plugin JSX/CSS | Fast Refresh | Plugin 局部状态是否保留 |
| AppUIModel | Preview 自动更新 | Agent 会话与 Runtime 状态是否保留 |
| 新增 definition + Registry | Preview 可用 | 是否整页刷新、错误是否可诊断 |
| 移除最后实例 | UI 和 service 正确卸载 | disposer、consumer 失效、状态残留 |

只有实测出现不可接受问题时，才设计最小 dev-only 修复。优先顺序：

1. 明确 Vite `import.meta.hot.accept` 边界；
2. 保持 AgentRuntime 实例在稳定模块中；
3. 让 model/registry 更新触发 React 重渲染而非重建整个页面；
4. 最后才考虑 dev-only virtual module。

禁止把修复扩张为生产动态 import、目录 glob registry 或 Cordis Package Runner。

## 7. 验证策略

### 7.1 每阶段最低命令

目标项目改动：

```text
pnpm verify:ui
pnpm typecheck
pnpm test
pnpm build
```

Creator package 改动：

```text
pnpm --filter @agent-ui/creator typecheck
pnpm --filter @agent-ui/creator test
pnpm --filter @agent-ui/creator build
```

Workspace 边界改动：

```text
pnpm typecheck
pnpm test
pnpm build
```

若 pnpm 因网络、签名或离线环境失败，应优先使用仓库已经安装的 package-local binary 复现同一检查，并明确记录环境失败，不得把它描述为代码通过。

### 7.2 必须包含的测试层级

- 纯函数单测：hash、Layout index、operations、generator、diagnostic dedupe；
- 文件事务集成测试：临时项目、stale hash、rollback、undo conflict；
- Creator tool 测试：Schema、权限、结果大小、revision 记录；
- AG-UI 流测试：question request/answer/abort、diagnostic events；
- Runtime React 测试：render/activation diagnostics 与错误恢复；
- 独立性测试：目标项目 package scripts 不引用 Creator；
- 真实 Workbench UI 测试：模糊定位、澄清、回执、撤销和错误修复。

### 7.3 不允许的“通过”方式

- 在 `verify:ui` 或 typecheck 中顺便生成/改写文件；
- 把 enabled 未挂载从 error 降为 warning；
- 把全部 Plugin Catalog 引入生产 Registry；
- 删除失败 Plugin 源码以消除错误；
- 放宽 Creator 写权限到整个项目；
- 用 mock runtime 通过来替代至少一个真实浏览器渲染失败测试；
- 用旧 revision 的验证或诊断证明当前状态。

## 8. 发布与迁移

### 8.1 兼容迁移顺序

1. 先给所有 definition 增加 default export，不切换入口；
2. 引入 generator 与 generated file；
3. 切换 `plugins/index.ts`；
4. 更新 verifier 并删除正则解析；
5. 上线 Snapshot/Inspect；
6. 上线语义 transaction，同时暂时保留直接 JSON 编辑作为紧急兼容路径；
7. 实测稳定后，在 prompt/skill 中把直接 JSON 编辑降为诊断性 fallback；
8. 上线 undo；
9. 上线 runtime diagnostics；
10. 上线 ask-user 后才开放源码删除。

### 8.2 Feature flags

建议开发期使用 host-side flags 分步启用：

```text
CREATOR_PROJECT_SNAPSHOT
CREATOR_APP_UI_TRANSACTIONS
CREATOR_RUN_UNDO
CREATOR_RUNTIME_DIAGNOSTICS
CREATOR_USER_QUESTIONS
CREATOR_PLUGIN_SOURCE_DELETE
```

flags 属于 Creator host 配置，不写入生成应用。正式稳定后删除已永久启用的 flag 和双路径代码，避免长期维护两套机制。

### 8.3 回滚

- Registry 切换失败：恢复旧 `plugins/index.ts`，保留 default exports；
- Snapshot/Inspect 失败：关闭 host flag，Creator 仍可使用只读文件工具；
- transaction 失败：关闭 flag 回退到受限文件编辑，但继续禁止 Registry 手工改动直到路径一致；
- diagnostics 失败：关闭开发 reporter，不影响生成应用；
- ask-user 失败：关闭工具并继续禁止源码删除。

回滚不能放宽生产静态 Registry、生成项目独立性或源码删除安全边界。

## 9. 完成定义

全部实施完成必须同时满足：

- `inspect_ui_project` 能准确解释当前 Layout、Slots、instances、assets、Registry 和 UI stack；
- AppUIModel 与 Registry 由一个 hash-guarded transaction 原子修改；
- Registry 是 AppUIModel 的确定性静态派生物，验证命令只读；
- 隐藏、移除实例、替换和删除源码具有不同可测试语义；
- run undo 不覆盖任何 after hash 已变化的文件；
- Creator 能读取带 plugin/instance/slot/hash 的真实渲染或激活错误；
- Creator 能在同一 run 询问必要问题并继续；
- Completion Gate 的所有证据都匹配当前 revision/hash；
- 目标项目独立通过 `verify:ui`、`typecheck`、`test`、`build`；
- Creator package 通过自己的 `typecheck`、`test`、`build`；
- 真实 Workbench 验收覆盖新增、布局修改、停用、移除、替换、受限删除、撤销和运行时修复；
- 生产 Bundle 不包含 Creator、Catalog 根、动态目录加载器或第二个 Agent Runtime。

## 10. 实施优先级摘要

```text
P0  基线绿线与现状记录
 ↓
P1  目标项目 Inspector + 静态 Registry generator
 ↓
P2  Creator Snapshot + progressive Inspect
 ↓
P3  AppUIModel transaction + revision/hash
 ↓
P4  read-before-edit + run undo
 ↓
P5  remove/replace/delete safety semantics
 ↓
P6  runtime diagnostics
 ↓
P7  same-run clarification
 ↓
P8  completion evidence / skills / workbench 收口
 ↓
P9  仅在实测需要时修 HMR
```

最先交付观察面和事务组合，能够直接降低理解错误与结构损坏；运行时诊断补齐静态门禁盲区；澄清通道只处理剩余用户侧歧义。源码删除必须等澄清、引用检查和 undo 三项基础能力同时就绪后才能对真实 Creator 会话启用。
