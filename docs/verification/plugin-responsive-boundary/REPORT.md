# Plugin Responsive Repair

日期：2026-10-12（Asia/Shanghai）

```ini
PLUGIN_RESPONSIVE_BOUNDARY = PASS
```

原 Creator B 的 `business-notes` 在 420px 的 light/dark × zh-CN/en-US 四组合通过。修复前父容器 `scrollWidth 303 / clientWidth 279 = FAIL`；修复后 `279 / 279 = PASS`。这是独立响应式报告，未修改或合并既有 style boundary 报告。

## 来源和交付

沿用 `docs/verification/creator-host-ui-delivery/business-closure/generated-source-diff/B` 的历史 Creator 交付，恢复到两个独立 Host。没有重新生成插件或调用模型。组件、definition、manifest 的 SHA-256 修复前后完全一致，原 locale、Host、AppUIModel 和 AntD 依赖保持原交付。每个浏览器测试校验来源哈希，并确认测试过程中源文件未变。

确认后只修改原业务插件的 `src/agent-ui/plugins/business-notes/styles.css`：根节点 own border-box/max-width，标题允许收缩和换行，Flex/List 内容允许收缩及长文本换行。原 `min-width:0` 保留；未改组件、AntD 控件、Modal API 或主题变量。

- [修复计划及确认记录](repair-plan.json)：风险、279px Slot、组件/CSS 源码、哈希、策略、修改理由和 diff。用户明确回复「确认应用并继续验收、推送」后才应用。
- [完整 before/after diff](proposed.diff)。历史原始交付保持不变。
- [修复后的可交付 Plugin CSS](after/src/agent-ui/plugins/business-notes/styles.css)，已应用至 `/tmp/plugin-responsive-repair-hosts/after` 的真实恢复 Host。
- [修复前 computed](before/computed.json)、[修复后 computed](after/computed.json)、[汇总](summary.json)、[执行环境](environment.json)。各目录包含四组合的 panel、Modal、long-content 截图。

历史 B 并不是当前 examples 内常驻源码；本次交付保留历史源、独立 repaired CSS 和可重放的恢复脚本，避免把历史取证文件覆盖成修复版本。

## Creator 最小能力

`prepare_plugin_responsive_repair` 是自主 Coding Agent 可调用的只读工具，不改变 Agent 的执行模型。通过已有 Operator inspect/verify 协议获取真实 Plugin 身份、源码和 warnings，返回 plan、精确 CSS anchors、原因、before/after diff 和源码哈希。拒绝官方依赖源码、非 CSS/未检查文件、不唯一或陈旧 anchor、无修改理由，以及需要额外发现的嵌套/截断源码。工具不写文件、不授予写权限；沿用已有确认和 scoped source edit 工具。

模型先运行 validate 捕获静态 baseline，检查 cascade、组件结构和真实 Slot，判断 warning 是实际风险、误报还是不确定，再提交具体 plan 并请求确认。CSS-in-JS、复杂 utility、inline layout 和动画必须暂停具体审查，不能猜测重写。纯主题变量不需修改组件。确认后重新读源并校验哈希；变更后 validate 和浏览器验收。根容器、Flex/Grid、长文本和固定宽度策略在现有开发 Skill 中说明，固定宽度可用 `width:min(100%,500px); max-width:100%`。

风险仍为 `PLUGIN_RESPONSIVE_*` warning，新增结构化 `file`、`selector`，保留既有 `path`、`line`、`pluginId`、message；不升级为 style isolation error。原 B 的真实工具联调结果从 1 个 FULL_WIDTH_PADDING hint 到 0 个，见 [Creator tool log](checks/creator-tool.log)。

`validate_creator_changes` 输出 `responsiveRiskCount`、`responsiveRiskResolved`、baseline count 和 `responsiveEvidenceKind=static-hints-only`。计数按当前 run 首次完整 verify 输出建立 baseline，跨 run 重置；重复 selector 风险按数量计数，行号变化不误算修复。未解析/截断输出为 null。resolved 表示静态 hint 消失，不能代表浏览器 PASS。

## 420px 验收

以下值取相同的 Modal 关闭后采样点；initial、notes、afterModal、440 字符无空格长文本四状态均单独检查。

| 组合 | 修复前 Slot client/scroll | 修复后 Slot client/scroll | 修复后根 width/x | Modal x/width | 结果 |
| --- | --- | --- | --- | --- | --- |
| light / zh-CN | 279 / 303 | 279 / 279 | 279 / 16 | 8 / 404 | PASS |
| light / en-US | 279 / 303 | 279 / 279 | 279 / 16 | 8 / 404 | PASS |
| dark / zh-CN | 279 / 303 | 279 / 279 | 279 / 16 | 8 / 404 | PASS |
| dark / en-US | 279 / 303 | 279 / 279 | 279 / 16 | 8 / 404 | PASS |

根 CSS width=279px、max-width=100%、padding=12px、box-sizing=border-box、min-width=0px。overflow 仍为原插件的 hidden；验收同时比较父容器、每个元素的 viewport 与 clipping ancestor 边界，检查标题/List 文本 Range，因此不能靠 hidden 或根自身 scroll/client 相等掩盖越界。长备注使用竖向列表滚动，无横向滚动；document 的 scroll/client 也通过。

标题、Input、添加/说明 Button、List item 和长文本均无横向越界/裁切。Modal 自身及内部文字、关闭 Button 位于 viewport 内，无横向 scroll。空白备注不新增、按钮 disabled、click/Enter 添加、输入清空、两次 Modal 打开/关闭、Tab/Shift+Tab、Esc、trigger 焦点返回均通过，无 pageerror。人工抽查 before/after light zh-CN panel 和 after dark en-US Modal 截图。

初次测试在侧边栏进入动画中采样 initial，暂时测到 x=-24；保留 [初次日志](checks/browser-initial-animation.log)。后续明确等待进入动画结束后测量，完整重跑 8/8，通过的 [最终日志](checks/browser.log) 对应当前 computed 和截图。未为通过测试更改 Host 动画或布局。

## 验证与限制

| 检查 | 结果 |
| --- | --- |
| 原始失败 + 修复后浏览器四组合 | 8/8 PASS，原始四项为 EXPECTED_RESPONSIVE_FAIL |
| 响应式 repair 单元测试 | 11 PASS：风险解析、策略、exact diff、边界/陈旧 anchor、只读工具、validate 计数/缓存/run reset、新插件创建 |
| Plugin CSS focused tests | 5 PASS，风险保持 warning、安全根规范通过 |
| Operator typecheck / build / 协议契约 | PASS |
| Browser 测试 TypeScript | PASS |
| 修复 B Host typecheck / build / verify:ui | PASS |
| 真实 Creator plan 工具 before/after 联调 | PASS，riskCount 1 → 0，无源码修改 |
| style isolation B 420 回归 | 5 PASS：四 theme/locale + Sidebar/官方嵌套，含原生控件、Modal/Portal |
| i18n / assistant-ui upstream guard | PASS |
| Python py_compile / diff check | PASS |

新插件响应式规范、创建工具说明和开发 Skill 保留；新增测试通过真实 create-only Plugin 创建服务保存并加载安全根 CSS。未新增生成模板、UI 库依赖或固定流程。本轮不运行新的模型生成验收；该测试验证确定性的 authoring/create 接口与规范回归，不能保证任意模型输出自动正确。

扩大检查发现既有失败，不能宣称仓库全套测试绿色：Creator validation/differential tests 当前 15 FAIL，在独立修改前 Python package 同样 15 FAIL（同名失败）；宽范围 `verify-ui.test.ts` 当前 13 FAIL，另有 23 PASS，独立修改前 Operator 副本同样 13 FAIL / 23 PASS；两组失败名称一致，见 baseline 日志。与本次专项、新增测试和真实 B Host 的 PASS 分开报告。

当前工作区仍有此前的 React shimmer/global styles、Tailwind 构建/依赖和 fixture package 未提交改动。本次没有修改或提交这些内容；浏览器使用当前 built React 包，执行环境已记录，不能描述为干净 checkout 的全产品验收。未改 AgentUIRoot、preflight、全局 styles.css、vendor、Plugin Runtime、Portal 或 Host UI 样式。现有 pnpm lockfile 漂移、AntD 5/React 19 提示、Vite native-loader 提示保留在日志；仅去除日志行末空白以满足 diff check。

## 重放

需要保留的历史 B raw Host 及其已安装依赖；也可通过 `RESPONSIVE_DELIVERED_HOST` 指定该 Host 路径。脚本使用历史 committed 源覆盖 raw Host 中已重置的交付文件，校验哈希后只应用已确认 CSS。

```sh
node docs/verification/plugin-responsive-boundary/run-browser.mjs
pnpm --filter @agent-ui/creator-workbench exec tsc -p tsconfig.responsive-repair-tests.json
PYTHONPATH=packages/creator-python packages/creator-python/.venv/bin/python -m pytest packages/creator-python/tests/test_responsive_repair.py -q
```

专项 runner 和 spec 位于工作区，CSS artifact 与证据独立保存。本次不运行完整官方 128 项浏览器套件，不沿用历史全量 PASS 作为本轮证据。
