# assistant-ui 升级验证（2026-10-16）

本次完成 Conversation 依赖与上游源码升级，保留 Generative UI 0.0.22。
升级以当前未提交代码的隔离快照为基线；不覆盖已有 Creator、Host 和模板改动。

| 依赖 | 升级前实际版本 | 升级后 |
| --- | --- | --- |
| react | 0.15.23 | 0.15.29 |
| react-ag-ui | 0.0.63 | 0.0.70 |
| react-langgraph | 0.14.29 | 0.14.36 |
| react-markdown | 0.14.16（旧 target 误写 0.14.6） | 0.14.23 |
| react-lexical | 0.2.15 | 0.2.18 |
| core / store | 0.3.27 / 0.3.19 | 0.3.29 / 0.3.21 |
| assistant-stream / assistant-cloud | 0.3.50 / 0.2.6 | 0.3.52 / 0.2.7 |
| AG-UI client/core | 0.0.59 | 0.0.59 |
| react-generative-ui | 0.0.22 | 0.0.22（保留） |

源码固定到发布提交 a46d6634e7a75eddd85d51415b1a615886d4ad0e。
Generative UI 保持独立的旧发布提交 3542d602272a62eddeb8989befc910841c267022。

## 冲突与处理

- 升级工具遗漏根 pnpm.overrides，造成新 LangGraph 使用旧 core/store/stream。
  现在这些固定依赖加入 target，依赖声明和 overrides 一起升级、一起检查。
  历史 docs 下的验证工程不再被批量改写；可重建的 .generated 输出也不参与消费者扫描，
  避免主工作区旧 Web Component 产物造成重建前的循环依赖。
- 新上游 .ts 辅助文件被同步器误判为删除。元素清单同时识别 .ts/.tsx，排除两类测试文件。
- 附件具名标签、审批问答、稳定 TriggerPopover、日期分组和 Reasoning forwardRef
  改变了生成锚点。更新产品生成规则并重生成；vendor 无产品补丁。
  日期分组完成后才翻译标签；无名文件继续使用产品 locale fallback。
- 新 ToolFallback 声明需要显式 core/assistant-stream 依赖，补齐依赖后原样 vendor 可构建。
- 新版本嵌套流式测试在 RUN_FINISHED 时稳定触发 Maximum update depth exceeded。
  堆栈定位到 ReadonlyThreadProvider.setMessages；父更新重建等价子消息快照，通知反向
  触发重复渲染。产品 TaskCard 适配层用 fast-deep-equal 稳定等价输入，真实内容、状态、
  metadata 变化仍透传。未创建 Runtime、未改消息转换器或 vendor。
  19 项嵌套流式/递归/审批/历史回归通过，包含原失败场景。
- Generative UI 0.1.4 已拆包到 @assistant-ui/generative-ui，并新增地图、Mermaid 依赖。
  现有两文件同步会生成缺失依赖、缺失本地模块的代码。此次不引入这些新能力；独立迁移
  需更新源码依赖闭包、样式/Portal 边界与 locale。后续无参数 assistant-ui:update
  仍会尝试最新 Generative UI，需要处理该迁移，不能声称已是一键无冲突升级。

## 实际验证

- core、renderer、plugins、runtime、source-registry、operator 构建通过；Runtime 构建含
  实际打包后的独立消费者类型验证。Plugins、Runtime typecheck 和 check:i18n 通过。
- upstream 来源/生成规则、固定 revision、版本声明、AG-UI 单版本/兼容、LangGraph
  已安装 API/依赖兼容检查通过。check:assistant-ui-latest 在 releasePinned 模式下只验证
  固定版本与声明一致，不代表所有可选包均为 npm 最新。
- 升级契约 35 项通过；补充专项 68 项通过、附件 locale 状态 3 项通过。
- Plugins 全量：696 通过、17 失败、9 跳过；升级前相同代码：689 通过、22 失败、9 跳过。
  逐项对照无新增失败；详见 test-comparison.json。剩余失败涉及旧包/目录/插件预期、
  引用文本编辑、表单回放、主题等原有问题，不作本次全量验收通过声明。
- Runtime 全量：131 通过、1 失败、1 expected fail。失败的 thread-list-binding fake
  agent 缺少 use()，在升级前同样复现。
- verify:assistant-ui-upgrade：契约与构建通过，但样式单测组有 1 个原有失败
  （AgentUIRoot 源码字符串预期），使总门禁未通过；该组 90 通过、9 跳过。
- 单独执行真实 Chromium 样式隔离：4 通过、2 失败。Host 样式、Row 布局、Portal 与
  业务内容隔离通过。390/1440px 的窄屏纯 CSS fixture header 不可见，两项均在升级前复现。
  embedded-after.png / embedded-after.json 保留本次浏览器证据，未改写历史验收记录。
- Windows：审查此次 manifest 遍历和逻辑路径匹配，沿用 native path / file URL API；
  pnpm Windows JS entry、cmd shim、exe 路由 fixtures 3 项通过。没有真实 Windows 运行，
  也没有生产 Agent 后端验收。

判断：Conversation 升级复杂度中等，可在既有产品适配边界内完成；确实出现一项
行为退化与多处生成锚点冲突。完整升级包含 Generative UI 时需要独立迁移，当前总门禁
还受原有失败阻挡。本次证据不等于整个产品或所有目标平台验收通过。
