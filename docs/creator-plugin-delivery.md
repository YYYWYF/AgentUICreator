# Creator Plugin Delivery

Creator 仍然是通用 Coding Agent。交付机制记录实施义务、读取实际工程和验证证据、拦截错误的完成声明；不把 Agent 改成固定步骤执行器。生产 Agent Frontend 不依赖这些 Creator 控制面模块。

## 能力发现

`inspect_ui_capabilities` 从现有 ProjectControl 获取已安装 Plugin、正式 Source、当前 Layout / Slot 和项目 UI Stack，并对项目组件路径作有限扫描。返回的是实时导航索引，不生成第二份权威 manifest。AppUIModel、Plugin 声明和被选组件的源码仍是事实来源。

返回值包括 `pluginInventoryComplete`、`componentInventoryComplete`、Source hash 和项目 hash。较大的结果使用现有连续分页机制；没有完整读取同一快照，不能据此声称能力不存在。组件路径扫描不跟随符号链接，不读取组件正文，不把文件名当作已验证能力。开发授权观察器只消费宿主返回的完整 Plugin / Source inventory，不消费模型自报的“已检查”。

## 交付契约和状态

`prepare_ui_plugin_development.deliveryContract` 声明：

- capability、renderingCategory、placement、lifecycle；
- dependencies、reusedComponents；
- verificationMethod、interactions，以及需要时的 geometry 数值断言。

契约属于 Creator proposal，参与 scope hash，并出现在审批方案中；不扩展 Plugin Runtime manifest，不改变已有的任务、请求和检查点授权边界。placement 必须来自项目实际支持的组合方式，最终由现有 AppUIModel mutation admission 校验。

`inspect_ui_plugin_delivery` 与最终回执使用同一个宿主计算：

| 状态 | 必要证据 |
| --- | --- |
| planning | 当前任务的交付目标与契约 |
| created | 匹配的 manifest、definition、index |
| registered | 生成 Registry 引用；正式 Source 安装还必须有 Source lock 记录 |
| composed | AppUIModel 中存在启用实例，父 Plugin 未禁用 |
| verified | 当前 revision 的 verify:ui、typecheck、Runtime、几何和声明的交互验证 |
| completed | 全部交付义务均满足 |
| blocked | 结束时仍有缺项，回执保留 lastSuccessfulStage、blockers、实例和验证状态 |

本地创建的 Plugin 不伪造正式 Source lock。Source 安装成功也不能跳过组合和验证；被安装的目标 Plugin 会进入相同回执。修改后重新读取事实，旧 revision 的行为/布局证据不能继续使用。

`CompletionDecision.accepted` 只表示是否结束当前修复循环。交付未完成时，最终 run completion 为 `blocked`，不能因模型说“完成”或静态检查通过而返回 `success`。静态模式保持原有权限与工具限制，只能交付静态证据，不能成为 Runtime delivery completed。

## Runtime 与浏览器证据

复用 `inspect_runtime_layout` 的真实 DOM 矩形和新鲜度。固定像素 Row/Column track、Panel width/height 会产生 `intentChecks`；尺寸不符、缺少矩形或观察过期都不能完成布局任务。其他视觉要求仍需声明具体 geometry 数值断言或行为测试；没有把一般 CSS/响应式语义猜成像素值。已有 semantic insertion 的 Host geometry tail 继续有效。

`verify_ui_plugin_behavior` 只运行目标项目**已经安装**的 Playwright executable 和现有配置，不通过包管理器自动安装，不接受命令、测试路径或模型传入的 PASS。该工具只在 `static_and_runtime` 的写任务中提供，并要求单独执行。它不放宽文件写入范围，也不安装浏览器或自动添加测试基础设施。

测试标题约定为 `[delivery:<pluginId>] <interaction>`。没有 interaction 列表的 browser-test 契约要求 `runtime` 测试。退出码、完整 JSON report、所有必需测试、每次执行结果、revision 和 proposal scope 均须通过；跳过、失败、flaky retry、截断输出和缺失测试都不能成功。缺少项目测试配置时明确阻塞，不能用模型声明替代行为证据。

## 分支整合范围

- 合入 `codex/reuse-development-auth`：开发授权与恢复、正式 Source 复用、局部改动回执、Registry 同步、布局窄屏约束、Creator 检查与调用收敛。
- 合入 `codex/t05-rerun5`：公共 Composer adapter facade、现有组件发现、callback / attachment-only parity。
- 补入 `24722d40`、`5360ebfa` 的最终差异：公共 hook 字段、multi-file picker、capability-gated 控件和 locale 规则。
- 其余分支的独有提交已用 patch identity 检查：review-t01、review-t08、reuse-a09b、reuse-a11a 的差异均是已合入提交的等价补丁。
- browser-test 工作区的 Dictation / Source 0.1.11 相关未提交文件与现有发布代码一致；测试 Host 的临时应用内容不进入主干。原 dev 的提示词与静态模式约束已在整合代码中保留。

## 验证范围

D01–D04 回归覆盖 Source 优先发现与权限、完整生命周期、组合失败恢复、组件路径与行为保留义务。额外覆盖 managed sourceRoot、禁用父实例、缺失 Source lock、过期证据、固定尺寸冲突、缺失/跳过的浏览器测试和完成状态。

真实 Chrome 测试覆盖 Host 行为验证工具执行勾选、筛选、重置并消费 Playwright JSON 的路径。它验证工具边界，不代表真实模型已自主完成 D01–D04 全部产品验收。

整合前分支 `26eaa72d` 在同一 Python 环境的全量基线为 778 passed / 109 failed。保留基线失败的归属，不把它们算作此次功能通过；本次发布说明应分别列出相关检查与全量结果。

本次整合全量 Python：795 passed / 109 failed，失败用例 ID 与上述基线完全相同，没有新增失败。后续固定轨道位置断言使用相关测试单独复核。

相关验证：Creator、ProjectControl、React typecheck；Creator build；ProjectControl contract inventory；ProjectControl 布局/verify-ui 75 项；Composer action/history 9 项；Creator 完成状态/回执 UI 12 项。真实生成的 embedded Host 能力索引已检查到 18 个 Plugin、39 个 Source Item、16 个 Slot。未运行真实模型的 D01–D04 自主产品验收。

最后一次相关 Python 回归：181 passed，包含真实 Chrome 的 3 个交互测试。其他工作区未跟踪的 dictation 测试已对照：主干版本正确传递 endpoint/threadId，比旧测试工作区完整，因此保留主干版本。
