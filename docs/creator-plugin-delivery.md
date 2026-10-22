# Creator Plugin Delivery

Creator 仍然是通用 Coding Agent。交付机制记录实施义务、读取实际工程和验证证据、拦截错误的完成声明；不把 Agent 改成固定步骤执行器。生产 Agent Frontend 不依赖这些 Creator 控制面模块。

## 能力发现

`inspect_ui_capabilities` 从现有 Operator 获取已安装 Plugin、正式 Source、当前 Layout / Slot 和项目 UI Stack，并对项目组件路径作有限扫描。返回的是实时导航索引，不生成第二份权威 manifest。AppUIModel、Plugin 声明和被选组件的源码仍是事实来源。

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
