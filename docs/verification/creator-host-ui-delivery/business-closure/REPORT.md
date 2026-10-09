# 宿主 UI 智能复用业务闭环交付报告

基线：`ce2525147b188c867b1de3d6bc325ba3ca162b19`。日期：2026-10-09。

**SCENARIO_B = PASS；HOST_UI_INTELLIGENT_REUSE = PASS。** A/B/C 均由真实 Creator 创建与挂载业务备注插件，最终 Host verify:ui、typecheck、build 通过，并完成独立浏览器验收。24 个浏览器用例全部通过，保留 48 张真实插件截图与对应源码哈希。详细状态见 [summary.json](summary.json)。

签收范围是隔离环境中的实际交付闭环，包含有界续跑与浏览器反馈后的修复。默认 MiMo 2048 输出预算未通过；没有修改生产默认模型设置，也不宣称默认配置能一次请求稳定完成。

## 实现

- 开发计划字段明确区分 `reuseEvidenceRefs`、`componentBasisRefs`、`uiScope`。新可视化插件的依据仍由现有 Host 条件校验；通用 Schema 不强制全部类型必填，不自动提取、搬运或补全路径。
- Prompt/Skill 以实际页面控件优先于已安装包清单。已有插件只作为接线和 locale 参考，不替代宿主组件依据。补充 Provider/Portal、嵌套 Esc/焦点、计算样式与容器宽度验收指导。
- 实际执行发现并修复严格协议不一致：inventory 输出移除内部 Sidebar 字段，展示事实继续保留在 capability summaries；对已存在的 `uiContext` 添加明确的严格类型 Schema，拒绝额外字段和非法值。
- 支持现有 `insert_sidebar_item` 进入有界开发授权路径，仍只允许当前授权插件或其真实实例；保留保留轨道、相对默认位置和异插件阻断。实例遍历限于实际 authoring edges，配置中的伪 Plugin 对象不能获得权限。
- 交付检查补齐 Sidebar header/content/footer/items.child 的实例遍历；新建/适配与已有身份扩展的错误回执更明确。Sidebar 新插件与已有实例互斥错误归入现有可恢复 precondition，使用原有预算和恢复机制。
- Registry 仍只收录 selected/resolved 插件；先同步源码和 Composition，再挂载并验证最终 Registry，不手工改生成文件。

没有新增组件评分器、自动库匹配、UI Adapter、参数修复 Agent 或业务状态机。没有修改 vendor、AG-UI、Plugin Runtime、Composer、dependency-owned 机制、默认模型配置或 P0 完成门语义。

## 实际交付

| 场景 | 模型实际选型与源码 | 最终静态检查 | 独立浏览器 |
|---|---|---|---|
| B | `antd` Button/Input/Empty/List/Modal/Typography 与 `theme.useToken()`；实际 App 的 ConfigProvider | PASS | 8/8 PASS |
| A | `../../../design-system` Button/Input/Card、宿主 CSS tokens、原生 dialog | PASS | 8/8 PASS |
| C | 同一自研 Design System；页面未使用 LegacyProvider，因此没有因安装 Ant Design 而选它 | PASS | 8/8 PASS |

三个插件均使用本地 React 状态，没有后端或新 Service，没有依赖安装/升级。原始 package.json 哈希保持不变。挂载复用既有 Sidebar，保留 history 默认项与主会话布局。

B 先由 Kimi 创建完整插件，再由真实 GPT Creator 续跑修正、挂载和最终验证。A/C 也由真实 Creator 编写，未由 Codex 手写业务插件。最初请求要求检查宿主并自主选型，未指定 Ant Design 或自研库；后续反馈依据实际生成源码和浏览器失败，要求保留已确认选型。见 [request-records.json](request-records.json)、[development-plan.json](development-plan.json)、[host-evidence.json](host-evidence.json)、[model-tool-chains.json](model-tool-chains.json)。

实际问题与修复：

- B：主题 Provider 能传递颜色，但 Agent 基础样式覆盖了输入字体、背景和边框。Creator 在插件内消费动态 Ant Design token，并通过公共 Modal API 将局部 token 带入现有 Portal；没有改基础样式、Composer 或 Runtime。
- A：窄屏原生 dialog 的 Esc 曾关闭父 Sidebar，随后焦点落在父 Sheet。Creator 局部隔离 Esc，并在 React 移除 dialog 后恢复触发按钮；后续按宿主真实字体约定补齐局部字体。
- C：选型正确，但英文 header 的最小宽度导致水平滚动，字体继承偏差、dialog 的 UA margin 被重置。Creator 使用插件内换行/容器查询与局部字体、dialog margin 修复。

Creator 按 `static_only` 交付，回执为 `statically-verified`，其中 `verified=false`，Runtime/geometry/interaction 仍为 `not-run`。独立 Playwright 浏览器结果是另外一层产品验收，没有伪造 Host Runtime PASS。A 最后一次字体修改走普通已有插件定制，没有新开发计划，因而最终 `deliveries` 为空；之前真实开发生命周期回执保存在 [lifecycle-receipts.json](lifecycle-receipts.json)，最新源码的三个构建检查见 [validation-receipts.json](validation-receipts.json)。

## 浏览器验收

每个宿主执行 1440/420 × light/dark × zh-CN/en-US，覆盖空状态、空白拒绝、点击添加与 Enter 添加、输入清空、备注列表、说明弹层、Tab/Shift-Tab、Esc、关闭按钮、焦点返回、关闭后备注保留，以及控件/弹层可访问和边界。

插件输入的字体、文字色、背景和边框与宿主同类控件比对通过；记录 Composer 交互前后计算样式未变化；没有页面异常或重复 React/Hook 错误。原生 dialog 允许 Tab 进入浏览器工具栏的默认行为，另验证其打开时底层输入不能获得焦点，Shift-Tab 回到 dialog，Esc 正常返回触发按钮。

[visual/](visual/) 中每例有备注列表面板截图和打开的弹层截图，全部来自真实生成插件。截图对应的插件四个源文件哈希与最终交付文件逐项核对一致。示例：[B 桌面浅色备注列表](visual/B-1440-light-zh-CN-panel.png)、[B 窄屏深色弹层](visual/B-420-dark-en-US.png)、[A 窄屏备注列表](visual/A-420-light-zh-CN-panel.png)、[C 窄屏深色弹层](visual/C-420-dark-en-US.png)。

## 模型与环境事实

默认 `mimo-v2.6-flash` / maxTokens 2048 出现过协议问题、预算耗尽和持续截断，没有取得默认模型验收成功。修复协议后默认输出预算仍未完成。比较模型、温度/API 兼容性错误、传输失败、选型偏差、预检 Hash 抄写错误、精确源码锚点失败、调用预算结束和待确认均保留在 [model-attempts.json](model-attempts.json)。

完成闭环的隔离配置：B 最初创建使用 `kimi-k2.6` / 8192 / temperature 1；其余完成与 A/C 使用 `gpt-6-luna` / Responses / 8192 / 不发送 temperature。生产 factory 和 `.env.creator.local` 未改。每轮仍限制 24 次模型调用，没有提高生产预算。部分续跑反馈未携带原开发委托而进入待确认；保留该记录后，重新携带用户原始明确开发委托启动新任务，没有伪造 `start` 回答、恢复旧 grant 或改变授权分类规则。

隔离 Host 链接现有构建包，Vite fixture 使用 React dedupe 以避免不同包链接带来第二份 React。这是验收准备，不是业务源码替写或 Runtime 修改。

## 回归

- 最终针对性 Python：85 passed，2 deselected（真实浏览器基础设施旧测试和已对比的旧契约 fixture）；具体日志见 `checks/focused-final.txt`。
- 授权回归：基线与当前均 60 failed / 17 passed，新增失败 0。
- 相同 P0 测试集：基线 32 failed / 81 passed；当前 32 failed / 89 passed。新增 8 个 Sidebar 实例交付测试通过，新增失败 0。历史 31 个失败之外的一项是本机旧 `.bin/playwright` 入口缺失；相同环境的基线也失败，本次真实浏览器使用已安装 Playwright JS API 正常执行。
- Python result contract：原有一个 fixture 失败在基线和当前相同；新增严格 uiContext 测试通过。
- Project Control recovery：基线 5 failed / 29 passed；当前 4 failed / 31 passed，新增失败 0，新增 inventory 测试通过，并解决一个既有协议失败。
- Project Control typecheck、`pnpm check:i18n`、Python compileall、diff 检查通过。没有触发 GitHub CI 或 release 签收。

失败集合、已解决项和日志见 [regression-results.json](regression-results.json) 与 [checks/](checks/)。没有宣称全套测试通过。

## 证据与复现

- [generated-source-diff/](generated-source-diff/)：真实 Creator 生成/修改的源文件与相对初始 fixture 的差异。
- [delivery-receipts.json](delivery-receipts.json)、[validation-receipts.json](validation-receipts.json)、[lifecycle-receipts.json](lifecycle-receipts.json)：实际任务回执、最终 revision 检查和生命周期。
- [model-tools.json](model-tools.json)、[model-tool-chains.json](model-tool-chains.json)：最终轮与完整开发/修复链的真实工具调用摘要。
- [browser-acceptance.cjs](browser-acceptance.cjs)：浏览器断言与截图脚本。设置 `CREATOR_ACCEPTANCE_OUTPUT` 为三个 fixture 的父目录、`CREATOR_SCENARIO` 为 A/B/C、`CREATOR_PORT` 为对应 Vite 端口即可重跑。

完整 fixture 与敏感原始日志保留在隔离目录 `/Users/yifei/.codex/visualizations/2026/10/09/01a11ec8-65e6-7c82-a29d-c24c3262dc4b/business-closure/raw/`。仓库证据不包含密钥或未脱敏模型请求正文。测试后停止本任务启动的 Vite 服务。未提交、未推送；同工作区其他任务的 Host/theme 修改保留。
