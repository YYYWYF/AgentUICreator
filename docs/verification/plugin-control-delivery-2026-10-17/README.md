# 官方插件第三、四批交付验证（2026-10-17）

本轮新增七个现代 npm 插件：`add-attachment-action`、`dictation-action`、`submit-action`、`response-footer`、`conversation-suggestions`、`thinking-indicator`、`tool-timeline`。累计 14 个现代入口及一个旧 Composer 兼容接管入口；不是全部官方插件都已迁移。[完整 inventory](inventory.json) 区分已接入入口、30 个待接入现代资源与历史兼容 ID。

## 实现与保留边界

- 附件、语音、发送/停止的唯一展示 owner 放在各自 `adapters/presentation/`；旧 public facade 和内部调用引用同一 owner。新包组件透传公开参数，原生附件/语音动作、发送保护、队列和取消行为保留。时间线详情的原生展开事件取消也经过交互检查，取消时不推进内部展开状态。
- 回复操作栏开放 root/actionBar/branchPicker props 和组合；仍调用语义 `renderSlot("actions")`。薄层的 Slot 委托校验按官方元数据识别组件，分别证明 renderSlot/renderScopedSlot 被透传，显式丢弃回调会报错。
- 建议提示提供完整的原生 suggestionsProps（components 或 render callback）、trigger/title/description props、renderSuggestion 和 children。CSS 与 CSS 类型声明纳入提取闭包；npm JS 入口显式引用 index.css，公开类型引用的 CSS 声明随 tarball 保留。
- 思考展示及 policy、工具时间线展示归各自插件 owner；两者共用的工具投影、原生 primitives 和 Context 保持共享 npm 所有权。scope 桥接使用组件自身 props，不再写死 group 类型；没有复制 Runtime/Context、改变 AppUIModel 或上游 vendor。
- 沿用现有 Creator 原生确认、Operator 精确安装版本提取与更新页实现同步服务。普通应用层编辑无需确认；拒绝/未答复不提取源码。源码合并范围仅 source/，不改变应用层、插件/实例 ID 和 AppUIModel。
- 有锁/无锁的旧定制源码均保持本地优先，不覆盖文件、不自动套薄层，不生成接管同意或新 BASE。旧安装包的 catalog 不会被强加新入口。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| Plugins、Operator build/typecheck | 通过 |
| Workbench preview-tests typecheck | 通过 |
| Operator 针对性 Vitest | 78 项通过 |
| Plugins 针对性 Vitest | 41 项通过 |
| Creator Python | 103 项通过 |
| Composer Node bundle/旧入口 | 2 项通过 |
| 源码目录/运行摘要 | 397 份 canonical snapshot 通过，portable closures 和 runtimeFiles 一致 |
| npm tarball | 14 个现代入口、15 个可提取闭包、159 条文件摘要通过；CSS/声明/策略/主题声明保留 |
| assistant-ui upstream-owned Elements | 通过，vendor 未修改 |
| i18n / diff check | 通过 |

224 项不重复的针对性测试通过。Operator 的通用生命周期覆盖 13 个非 Composer 现代插件，执行 npm 模式、提取后和合并后的真实严格 TypeScript 检查/Vite 构建。其 43 项文件已在最后的多资产检查中完整重跑，包含每个 ID 有锁/无锁的旧定制保护。建议 CSS 和思考 policy 另构造同时有 LOCAL/TARGET 修改的冲突，显式合并后保留双方改动与应用层原字节，验证成功后推进 BASE。中文/空格路径、CRLF、过期计划、拒绝、不兼容 API、单一注册及 Windows 进程/路径行为均有相关覆盖。

[机器记录](validation.json)；[发布包检查](tarball.json)。包与插件仍为未发布的初始版本；升级候选在临时工程构造，不是实际新的上游发行版。没有发布、提交或推送。

## 真实生成 Host 浏览器证据

1. [npm 模式：薄应用层 sendProps 生效](generated-host-thin-props.png)。
2. [接管后：本地实现修改生效，应用层定制保留](generated-host-owned-source.png)。

使用真实初始化工程、当前构建的 npm 组件、共享 canonical Runtime 和本地 AG-UI 服务。接管由测试直接执行 Operator，随后修改提取的发送实现并刷新。包引用和源码托管两种模式均直接点击发送按钮完成 AG-UI 请求，共两次运行；DOM 检查本地源码标识、应用层样式和发送草稿，浏览器无 pageerror。重放脚本为 `scripts/verify-plugin-control-delivery.mts`；精确结果在 [browser.json](browser.json)。

这轮未调用真实模型；确认/拒绝由实际 LangGraph interrupt/resume 测试覆盖，不能把浏览器截图称为模型操作 Creator 的完整证据。旧 fixture 按用户要求未修复，也没有重新扩展运行此前失败的整套回归，因此本报告不表示全仓库全绿。

Windows 进行了路径/进程 fixture 和发布声明检查，未进行原生 Windows 实机验收。旧工程自动拆分应用层、其余 30 个现代资源与大部分历史兼容 ID 的默认包化仍待后续批次；不静默重写用户工程。
