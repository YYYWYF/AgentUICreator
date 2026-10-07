# 全插件 i18n 浏览器验证：BLOCKED

日期：2026-10-07（Asia/Shanghai）。当前工作区 HEAD：`c451d99ed16f86ce6b26c683958a41285c681c33`，包含原有未提交改动及本轮测试基础设施修复。不是 `adf221a2` 的干净 checkout，也不是远端 CI 恢复绿的声明。本轮未提交、未推送，没有调整产品视觉样式、vendor、Locale Service 的依赖边界。

## 交付物

- [156 张主矩阵截图索引与逐插件表](gallery.html)：可按 locale、desktop/narrow、场景或状态筛选；点击原图。
- [逐插件机器可读覆盖](coverage.json) / [36 行 CSV](coverage.csv)：31 个视觉 Plugin + 5 个纯 headless Plugin；`AUTOMATED_CHECKS_PASSED` 只表示关联自动检查通过。
- [完整 Playwright 结果](evidence/results.json)：88 个测试，84 passed、4 failed、0 skipped、0 flaky。
- [Quote 校准后的选区证据](quote-findings.json) / [4 组合重跑结果](quote-calibrated/results.json)：另含 4 张失败截图和 4 份 trace。
- [原始远端 run](i18n-github-runs.json) / [jobs](i18n-github-jobs.json)、各项本地验证日志（见下表）。

## 两个原始 P1 的核验与收尾

GitHub API 确认 `adf221a297c2e6fb8d6a0b6eaaea42971b9997a5` 的 [run 37571252670](https://github.com/YYYWYF/AgentUICreator/actions/runs/37571252670) 已完成且 failure：

| Job | 远端结果 | 当前本地结果与证据 |
| --- | --- | --- |
| [style-isolation](https://github.com/YYYWYF/AgentUICreator/actions/runs/37571252670/job/112630173414) | failure | [升级验证日志](i18n-upgrade.log)：81 个 React 测试（包含 Thread Delete 2 项）、39 个 Project Control 测试、3 个浏览器测试通过 |
| [agent-connection](https://github.com/YYYWYF/AgentUICreator/actions/runs/37571252670/job/112630172975) | failure | [16 个 focused unit tests](i18n-connection-unit.log) 和 [3 个浏览器 E2E](i18n-connection.log) 通过 |

Thread Delete 原 fixture 的 `PluginServiceProvider is missing` 已复现，随后加入真实 `PluginServiceProvider`、真实 `locale-provider` registry/model；没有 mock locale hook 或放宽 Service 依赖。

Agent Connection 的 dependency resolver 现在优先使用当前工作区包，避免优先命中旧安装包。实际使用的 `@agent-ui/react` 为 `0.1.1`，满足 Source Registry `^0.1.1`。fixture 的独立 Host mount、Mock/Connected source、流式输出和会话隔离测试通过。原工作区已有此 fixture 的其他修改，保留并一起验证。

本地 style-isolation 使用现有 embedded Host；准备日志提示其部分 foundation/plugin customized，自动更新被保留规则跳过。该结果不是 clean-checkout CI 或所有生产业务流的替代。远端仍是旧提交的失败状态，需要提交并触发 Actions 后才能确认恢复绿。

## 主矩阵

| Locale | 尺寸 | 自动检查 |
| --- | --- | --- |
| zh-CN | 1440 × 900 | 21 passed / 1 failed（Quote） |
| zh-CN | 390 × 844 | 21 passed / 1 failed（Quote） |
| en-US | 1440 × 900 | 21 passed / 1 failed（Quote） |
| en-US | 390 × 844 | 21 passed / 1 failed（Quote） |

日志：[完整矩阵](i18n-matrix-final.log)。使用真实生成的 Source Registry 文件、PluginServiceProvider、Conversation Runtime、AppUIModel/Slot 组合及 deterministic AG-UI mock 服务。安装 36 个 release Plugin；额外的 `visual-test-probe` 仅属于测试 Host，提供 Mention 测试数据和对象身份观测，不计入 release Plugin。

一次性 Host 使用合法 trailing-drawer AppUIModel：会话是 primary，历史列表是 trailing drawer。最初冒烟 fixture 的 drawerIndex 指向 children 末尾，没有真实 drawer，窄屏被固定侧栏压窄；这批截图已被最终 evidence 替代，不作为产品布局缺陷。当前四组合会话宽度均至少 300px，未检测到 document 横向溢出。

矩阵覆盖 empty、default/success、running、tool error、Thread List loading/error、reasoning/tool collapsed/expanded、长 Markdown、Mention 空结果/长标签、Slash query/popover、附件、dictation running、footer hover/More/export、history More、Lexical edit、兼容 footer，以及 light/dark/violet。不是每个 Plugin × 所有状态的笛卡尔积；每个 Plugin 的关联场景和未测能力写入 CSV/JSON。

## 本轮的浏览器发现

### 阻塞：Quote toolbar 无法触发

`conversation-quote` 的四个测试均失败。最初桌面自动双击落在段落空白处，选中的是换行；随后把点击校准到文本内并对四组合单独重跑，仍全部失败。

校准后四个实际选区均为 `你好`，`selectable=true`，都能读取 messageId，但 `toolbarCount=0`。因此这项不是“没选中文本”的假失败。当前只能确认生成 Host 可复现；toolbar 上下文、挂载或选择生命周期的具体责任点仍需要定位，不能仅凭 fixture 宣称某个 Runtime 模块有 bug。

结果：[选区 JSON](quote-findings.json)、[校准日志](i18n-quote-calibrated.log)。各组合 [quote-calibrated](quote-calibrated/) 下保留失败 screenshot、error-context 和 Playwright trace。尚无 Quote preview 成功截图。

### 阻塞：中文 Thread List 仍出现英文默认文案

中文截图中 `New Thread`、`Search threads` 仍为英文，且搜索可访问名称同样来自英文默认值。Source `PolicyThreadList` 没有给公开 `ConversationThreadListNew` 提供 children，也没有给 `ConversationThreadListSearch` 提供 placeholder/aria-label。

这些位置已有公开 props/composition seam：New 支持 children，Search 支持 input props 覆盖。后续应由产品 Policy/adapter 消费 `threadList` namespace 补齐，不需要修改 vendor。本轮按“先验证，不直接调视觉”保留问题。

### 需复核：窄屏 Header action 遮挡用户消息

[en-US narrow 导出菜单截图](evidence/i18n-plugin-visual-mention-263d7-tation-edit-and-export-menu-en-US-narrow/export-menu.png) 中，右上 theme control 与第一条用户气泡重叠，遮住了部分 `Editable historical user draft`。菜单自身没有越出 viewport，但这不能证明 Header/action 的视觉布局通过。此项来自代表性截图检查，尚未补重叠面积断言，也未调整产品样式。

### 通过的状态与 Overlay 检查

- 切换语言后，普通 draft、`@query`、`/query` 保留；输入 DOM 节点没有重建。
- 测试 probe 验证语言切换前后 Agent runtime、thread binding、locale/conversation/theme service 对象身份一致。
- 选中历史会话后切语言，已显示的 assistant message 节点和 AppUIModel hash 保留，历史消息仍可见。
- history More 和 response export menu 保留在 AgentUIRoot Portal 内；Mention/Slash listbox 位于 AgentUIRoot 内，export menu 的 bounding box 不超出 viewport。
- 独立 style-isolation 浏览器测试验证 Tooltip、Popover、Dialog/facade Dialog 的主题 Portal 归属及 Host 样式隔离。
- light/dark/violet 通过真实 theme service 切换；图表的可见 marker 有独立断言，避免把 assistant transcript 出现当作 chart Plugin 已渲染。

Thread List 的 HTTP list pending 状态已捕获；此时 service 状态为 loading，但不出现 upstream thread skeleton，不能把这张截图称为 skeleton 浏览器验收。独立 Thread Delete 测试的 skeleton locale 环境已修复。

## 31 个视觉 Plugin 与 5 个 headless 的范围

| Surface | Plugin |
| --- | --- |
| Conversation | conversation-surface、conversation-thread-list、conversation-suggestions |
| Composer | assistant-ui-composer、assistant-ui-submit-action、assistant-ui-add-attachment-action、assistant-ui-dictation-action |
| Trigger / Rich Input | assistant-ui-mention-trigger、assistant-ui-slash-command-trigger、assistant-ui-lexical-composer-input、assistant-ui-lexical-edit-composer、conversation-quote |
| Response Footer | assistant-ui-response-footer、assistant-ui-message-footer、assistant-ui-copy-action、assistant-ui-reload-action、assistant-ui-export-markdown-action、assistant-ui-feedback-actions |
| Agent Activity | assistant-ui-reasoning、assistant-ui-tool-group、assistant-ui-tool-fallback、task-group、agent-status-message、agent-plan-message、job-progress-message |
| Structured Output | web-search、retrieval-chunks、source-citations-message、generated-file-message、chart-message |
| Global Control | theme-switch |
| Headless 集成 | locale-provider、theme-provider、conversation-service、conversation-data-source、conversation-command-source |

有 Message/Tool UI 的 headless capability Plugin 被纳入视觉范围。5 个纯 headless 通过其真实消费者验收：draft/history/对象身份、主题切换、会话加载与 HTTP error、Slash popover；没有给纯 headless 虚构截图。

## 验收边界与剩余缺口

84 个自动检查通过不等于 30 个 Plugin 的全部状态已签字。仍缺少可复用的 screenshot diff 基线和对全部图片的逐项视觉签署；本轮仅检查代表性截图。以下能力没有被本次证据完整覆盖：

- Clipboard copy 成功/失败、reload 后 branch/persistence、Feedback submit 成功/失败、导出文件内容。
- 真实麦克风权限、Dictation backend、image zoom 和所有 encoded/audio/video 文件形态；听写使用 Host 测试 adapter。
- 每个 structured Tool 的 loading/error/invalid-result，以及所有超长消息/tooltip/popover 的 viewport 约束。
- 语言切换时全部 Composer/Header/Thread List 尺寸变化的数值回归，以及执行 `/new` 的语义闭环。
- 所有已记录 upstream localization gaps 的人工判断；中文 mock/历史消息在 en-US 中仍保留中文是 Agent 数据，不应翻译。

这些缺口已写入 coverage 文件；不能把 `AUTOMATED_CHECKS_PASSED` 解读成“全状态视觉验收通过”。

## 静态验证与复跑

[React typecheck](i18n-react-typecheck.log)、[Preview tests typecheck](i18n-preview-typecheck.log)、[check:i18n](i18n-static.log) 通过。Node `v24.20.0`，pnpm `11.24.0`，Playwright `1.63.0`。报告脚本通过 Node syntax check。

```sh
pnpm verify:assistant-ui-upgrade
pnpm --filter @agent-ui/creator-workbench test:e2e:agent-connection
pnpm --filter @agent-ui/creator-workbench test:e2e:i18n-plugin-visual
```

最后一条目前会因为 Quote 检查失败返回非零，但仍输出 results、coverage CSV/JSON、gallery 和失败 trace。新增 `.github/workflows/style-isolation.yml` 的 `i18n-plugin-visual` job：运行四组合，始终上传证据。release Plugin 列表 guard 会阻止新增 Plugin 被无声遗漏，新增 Plugin 需要补场景和覆盖归类。

**结论：原两个 fixture 阻塞在当前本地工作区已形成通过闭环；远端 CI 未恢复确认。全插件视觉验收继续 BLOCKED，需要先处理 Quote 和 Thread List 文案，再完成剩余状态/视觉复核。**
