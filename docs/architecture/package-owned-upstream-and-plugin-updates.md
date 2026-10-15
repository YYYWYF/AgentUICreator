# 包内上游实现与按插件更新

> A2UI 当前暂缓推出；本文 A2UI 扩展和迁移部分是保留的实验设计，不代表现阶段可用。详见末尾发行状态。

此文档是当前交付边界；覆盖 P3R 历史文档中把 vendor 源码写入生成项目的约定。

## 源码所有权

assistant-ui 上游实现、默认 Generative UI vocabulary、样式和来源记录属于运行时包内部。用户工程不接收 vendor 源码，不导入包的内部路径。公共会话状态和 Runtime 由已有运行时包负责；Creator、Operator 和 Source Registry 仅在开发时使用。

`@za38.03/agent-ui-react/generative-ui` 提供可选能力入口，`@za38.03/agent-ui-react/generative-ui.css` 提供样式。上游依赖版本由 React 包固定。来源记录在 React 包的 `internal/vendor/assistant-ui/generative-ui/UPSTREAM.json`，与实现共同交付。Source Registry 只安装薄的项目集成、配置和可定制插件源码；release gate 禁止新资源向 `vendor` / `vendors` 目标写入文件。

## A2UI 扩展

生成项目的 `integrations/a2ui/components.ts` 导出 `a2uiComponents`。组件条目遵循上游 `GenerativeUILibrary`：description、properties Schema、render，可选 streamProperties。新名字添加组件，同名条目显式覆盖默认实现。组件使用目标项目自己的 UI 依赖；不依赖 Creator UI。组件的业务属性避免使用 A2UI 节点保留字段（例如 id、component、children）。

`A2uiConversationIntegration` 默认读取该配置，也接受 `components` prop；底层 `createA2uiConversationToolkit` 同样接受 components。自定义交互通过 `$action` / `$dispatch` 进入现有 `sendAction`，不创建另一套 Agent Runtime，也不自动授权 frontend tools。

普通 JSON Generative UI 使用 `createAgentUIGenerativeUI({ components, actions })`。原生 A2UI 使用 `createAgentUIA2ui`：默认 Surface 保留上游 native render；Surface 包含已注册的新组件类型时，使用上游公开 reducer 和 `convertSurfaceToUISpec({ keepUnknownComponents: true })`，再经过相同 library 渲染。未注册的组件不因此获得渲染权限。

自定义 Surface 的数据在 AG-UI 更新时重新转换；自定义组件自身负责交互状态和动作。当前公开的上游保留未知组件转换接口不提供 native live-binding context，因此不要依赖该分支自动把输入控件编辑回写 Surface dataModel。默认组件 Surface 继续使用上游原生绑定。此限制需要上游公开扩展 binding seam 后才能统一，不能通过修改 vendor 或导入其私有路径绕过。

## 现有工程迁移

通过官方 A2UI 资源安装/更新入口升级。未修改的受管旧 vendor 文件会与适配层更新一起被事务移除，source-lock 同步改为包入口桥接。已修改、缺失或冲突的受管文件阻止自动迁移；先保留用户修改并人工迁移到自定义组件配置，不能强制覆盖或清理未知文件。未受管的旧源码也不能自动删除。

## 选择性更新

Source Release 是不可变的资源目录快照，不是要求所有插件统一版本。每个源码插件在 manifest、changelog 和 source-lock 中记录自己的版本及来源 Release。用户可以先升级开发时的 Registry 包，再只选择需要的插件更新工程源码；不重新初始化工程。

`AgentUIUpdateService` 默认使用 `InstalledUpdateSourceProvider`，最新版本取自当前安装的真实 Registry，绝不默认使用 Mock fixtures。工具 Host 可注入 provider，或构造 `InstalledUpdateSourceProvider(registryRoot, historyRoot)`。historyRoot 的每个 `<releaseVersion>/` 是包含 release.json、registry.json、items 的完整不可变历史 Registry。缺少历史版本时明确拒绝三方合并，不猜测 BASE。

更新计划列出 requestedPlugins、每个资源的 reason（requested/dependency）、requiredBy、变化文件、版本和阻塞项。执行仅触及所选插件及必要的变化依赖；不更新内容未变化的依赖基线。未选择且不属于依赖闭包的插件源码和版本保持不变。共享依赖发生变化时不能保证只修改单个插件目录，执行前会检查整个工程；失败回滚，过期计划失效。本地定制进入 BASE/LOCAL/TARGET 合并，验证后才推进基线。

包内上游实现通过 npm 依赖升级，不进入源码合并。npm 子路径不具有独立版本；当前 `agent-ui-plugins` 只有 Composer 的包交付，不能把将来的多个独立升级插件都用该包的统一版本伪装成独立版本。需要独立演进的包插件应独立发行；现有源码插件继续独立选择升级。当前更新页面管理源码插件；不会宣称它能独立更新单个 npm 子路径。

## 验证

运行 `node scripts/verify-project-upgrades.mjs` 验证真实初始化、A2UI 暂缓安装限制和选择性插件升级；运行 `node scripts/verify-public-packages.mjs --strict-types` 验证实际 tarball 的类型和生产构建。前者使用隔离临时工程和本地构建包，不使用 mock 项目验证器。

路径通过 Node path API 访问，manifest 路径保持 POSIX；无 shell 依赖，进程使用已有 pnpm helper。真实 Windows 验收与 macOS 运行证据分开记录。

发布前必须递增有变化的 npm 包版本，并同步资源要求及第一方固定依赖。工作区构建验证不等于已发布可用版本，禁止用相同版本覆盖已发布 tarball。每个插件的 manifest、changelog 和 Release 索引必须一致；本次同时补齐前期公共包迁移造成的 27 个插件版本记录缺口。

## 当前发行状态：A2UI 暂缓

A2UI 目前不对用户开放，优先级高于本文前面的实验扩展描述。官方资源目录、Mock 演示、示例页面和自动会话组合均不启用 A2UI；直接资源安装被拒绝。A2UI 专用 API 不再从发布包导出；实验实现仅在仓库保留，已有工程源码不强制删除。普通 JSON Generative UI、其他插件和选择性升级继续可用。

恢复前必须验证新增组件与默认输入控件共用状态及绑定、服务端更新合并、动作携带最新值，以及完整主题/locale 表现。上游 vendor 保持不修改，历史验证报告不作为 A2UI 已发布的声明。


## npm 发布内容排除

A2UI 不是独立 npm 插件包，其实验代码曾分散在以下包：

| 包 | 排除的自有内容 |
| --- | --- |
| @za38.03/agent-ui-source-registry | integration/a2ui 资源模板与开发测试 fixtures；发布目录不包含该资源记录 |
| @za38.03/agent-ui-creator | 两个 A2UI Mock 示例模块、相应示例文案和安装指引 |
| @za38.03/agent-ui-react | createAgentUIA2ui 专用入口及实验渲染实现 |
| @za38.03/agent-ui-runtime | useConversationA2uiAction 专用动作桥接入口 |

Source Registry 只发布 dist 下筛选后的资源资产，源模式工具仍可读取仓库中的实验模板；因此“仓库保留”不等于“npm 包下发”。React/Runtime 的 experimental 目录被排除构建并清理旧产物，Creator 打包保留其他 skill references。发包验证检查真实 tarball 的文件列表、发布 Registry 清单和公开 API。

上游 assistant-ui npm 依赖自身可能包含 A2UI 协议支持；通用协议兼容字段和禁用判断也可以保留。这不代表本产品发布 A2UI 功能，不能为消除相关字符串而修改 vendor 或破坏通用 AG-UI 支持。普通 JSON Generative UI 继续发布。
