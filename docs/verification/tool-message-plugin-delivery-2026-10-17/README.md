# 第五批：工具回退与临时助手消息

本轮接入 `tool-fallback` 和 `transient-assistant-messages`，现代 npm 入口累计 16 个，另保留旧 Composer 接管入口。剩余 28 个现代插件资源与 19 个兼容资源 ID 见 [inventory.json](inventory.json)。专用工具结果、状态、计划等 data-message 插件尚未接入这一交付链路；它们的 toolkit/data 注册不能当作普通 Component 注册处理。

## 实现与所有权

- `tool-fallback` 的完整展示主体归 `src/plugins/tool-fallback/adapters/presentation/tool-fallback.tsx`。审批、问题选项、二次确认、错误重试、interrupt、焦点恢复及已有协议结果字符串保留。默认行为不创建新 Runtime。
- npm 插件接收 Host scope 中的 `tool`，应用层可设置 root/trigger/content/args/result/error/approval props；支持受控展开、默认展开、children、trigger/content 覆盖及公开 Root/Trigger/Content/Args/Result/Error/Approval 组合。审批焦点事件与内部行为组合。公开审批字段与回调保持上游类型，原 facade 保持兼容。
- 原始 assistant-ui upstream 未修改；旧适配路径只转发到唯一产品 owner。适配生成器先核对已审查的上游适配 SHA，再生成桥接。上游或适配 recipe 变化会拒绝生成并要求审查合并 owner，不会无声重建旧副本。该 SHA 是上游审查锚点，不是用户源码合并 BASE。
- 共享 support 仅提供原语、hooks、locale、图标及现有状态能力。图标按渲染时解析，修复循环初始化导致取消/过期状态图标未初始化的问题。实际 portable source 不额外要求工程直接安装 lucide-react。
- 临时消息展示归其插件目录，开放 rootProps/textProps/renderMessage；共享存储、订阅 Context、锚点计算与真实 Runtime 保持 npm 所有。默认角色/错误标签继续使用统一 locale。临时消息不写入真实 Agent 消息或请求。
- 两个条目的 npm 构建、精确版本快照、薄层初始化、Creator admission、原生确认与更新页同步复用同一 delivery/catalog。接管只切换应用层静态 import；源码合并只处理 source/。
- 新增 `toolPresentation.replyQueued` 中英文文案，补齐产品已有排队状态展示，不修改 vendor。

## 验证

相关 **227 项测试通过**，明细与边界见 [validation.json](validation.json)：

- Plugins：32 项，覆盖 npm props/组合/受控展开、原生审批拒绝与重试、准确 portable snapshot 的相同行为、临时消息共享 Context、消息与中断隔离、来源布局、locale 和生成桥接。
- Operator：84 项。通用生命周期覆盖全部 15 个非 Composer 现代插件，真实 TypeScript 与 Vite 构建；新条目使用带 props 定制、中文注释及 CRLF 的薄层。逐项验证接管、npm 替换、显式冲突合并、BASE 采用、单一注册，以及有/无旧 lock 的历史定制保留。
- Creator Python：109 项，包含新增两项 ID 的真实 LangGraph 询问中断、同意/拒绝恢复和写入边界。
- Node 包边界：2 项。

Plugins / Operator 构建与类型检查、上游完整性、i18n、公开声明和 diff 检查通过。实际 tarball 中 16 个现代入口、17 个 portable closure、401 个 canonical snapshot 与 179 个 portable/runtime 摘要记录全部核对；所有 exports 目标存在，主题类型保留，未打包 tests/node_modules。见 [tarball.json](tarball.json)。

Windows 检查使用 drive/UNC/逻辑路径拒绝样例、path.win32 断言，以及带中文与空格的生成工程原生路径验证。未运行原生 Windows。npm 升级验证使用临时构造的 0.0.2 目标，未发布包，未宣称真实上游升级验收。

本轮没有重新运行真实 Creator UI/外部模型全流程，也没有生成新的过程截图；原生审批测试与生成工程测试不能替代该验收。未修旧 fixture。额外检查时观察到 `assistant-ui-integration-boundary.test.ts` 中一个旧 Host 源文本断言失败（期待 `<AgentUIRoot theme={theme}>`）；原样保留，其余三项通过，未计入上述通过总数。没有宣称全量测试通过。
