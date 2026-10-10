# Plugin typography boundary 与 Modal 绘制验收

日期：2026-10-10（Asia/Shanghai）。受测产品基线：`f179cf21`。

`PLUGIN_STYLE_BOUNDARY = PASS`（本次 typography / 原生组件边界 / Modal 绘制范围）。

## 产品实现

当前基线已经包含 `de80131b` 的 typography boundary，以及 `f179cf21` 的 ownership 修复，因此本次没有再次修改产品样式。`AgentUIRoot` 在绘制前捕获宿主 font-family、font-size、font-weight、font-style、line-height 和 color-scheme，现有 `.app-ui-plugin-instance` 恢复这些值；官方 presentation root 使用 Agent UI typography。沿用当前挂载 class，不修改 Runtime 增加新协议或 DOM 属性。

保留显式宿主行高，不能统一改成 `normal`，因为 `font: inherit` 的业务组件需要继承宿主实际值。本次没有全局 Reset、`all:initial`、组件库适配层、vendor/Runtime 改动或 Modal 产品代码改动。

## 验证结果

- 明确复现：移除 Plugin mount class 后，业务 Input 在 Agent UI 的 `30px` 行高下高度为 `42px`；恢复边界后，与外部宿主一致为 `36px / 24px`。宿主行高改为 `28px` 后，两侧同步成为 `40px / 28px`。light/dark 均通过。该独立回归组件使用 `font:inherit`、5px vertical padding、1px border，没有 Plugin 专用修复样式。
- A 自研 Design System、B AntD、C 安装 AntD 但使用自研组件：24 个等宽场景通过，覆盖 1440/420、light/dark、zh-CN/en-US；Input/Button default、hover、focus、disabled，Button active，Card，B List/Card body，以及 fake slot 原生控件。A/C 使用原 Host DS React 组件及原 stylesheet；独立显式行高回归另行记录。
- Sidebar / 官方 Dialog 内嵌组件：6 个场景通过。嵌套容器宽度不同，仅这些场景排除 width 对照，其余 computed styles 均比较；24 个等宽场景完整比较 width。
- 实际 `PluginInstanceRenderer` 挂载的原生 AntD：8 个场景通过，记录实际 Plugin ID / instance ID / AgentUIRoot ancestry。只在 disposable Host fixture 中替换业务组件，用于验证原生组件；原 Creator 输出没有修改。
- AntD Input 与宿主一致：height 32px、radius 12px、padding 4px 11px。
- Modal 等待 500ms，检查非零尺寸、opacity=1、transform=none、无正在运行的动画、body Portal、mask opacity=1、wrap/mask z-index、中心点 `elementFromPoint` 命中弹窗后再截图。24 个基础场景的宿主/Plugin Modal 和 8 个真实 Runtime 场景均通过，并检查 Tab、Shift+Tab、Esc 与 AntD trigger 焦点返回。桌面示例：520×160、z-index 1000、mask rgba(0,0,0,0.45)。
- 官方完整浏览器回归：128/128，通过 Composer、Sidebar、Thread List、ToolTimeline、ThinkingIndicator、键盘交互、动画与 Markdown 等。截图人工抽查了桌面 light Modal 与窄屏 dark 实际 Runtime Modal。
- React build/typecheck、浏览器测试 typecheck、focused tests（3 files / 8 tests）、i18n、assistant-ui upstream 校验通过。

## 证据

- [Design System typography](typography/design-system.json)、[AntD typography](typography/antd.json)。
- [Modal computed styles](modal/modal-computed-style.json)、[Modal 截图](modal/screenshots/)。
- [Plugin 回归](regression/plugin.json)、[Agent UI 回归](regression/agent-ui.json)、[完整官方结果](regression/browser-results.json)。
- [原始计算样式](computed-raw/)、[浏览器与静态检查日志](checks/)、[环境与源码哈希](environment.json)。

## 验收范围与既有问题

本次 PASS 只签署上述样式边界及 Modal 绘制回归。原 Creator B 业务插件的 `width:100% + padding:12px + content-box` 窄屏越界，是已有报告记录的业务面板尺寸问题；本次没有修改该插件，也没有重新签署原 Creator 交付整体验收。[既有报告](../REPORT.md) 的 `NOT_ACCEPTED` 和失败证据保留。此次没有运行新的 Creator 模型生成、全 workspace CI 或 release acceptance。

AntD 5 在 React 19 下的 compatibility warning 原样保留在日志中。Modal 实际交互与绘制依据上述浏览器证据判断。

## 重跑

需保留此前 Host fixture 与依赖安装；默认路径为 `/tmp/host-ui-p1-20261009/fixtures`（`STYLE_B_FIXTURE` 可替换 B 路径，A 位于其 sibling）。实际 Runtime runner 使用 `/tmp/plugin-style-final-hosts/B`，来源和恢复方法见 `../run-restored-hosts.mjs`。这些保留 fixture 不属于产品运行依赖。

```sh
pnpm --filter @agent-ui/react build
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.style-acceptance.config.ts
STYLE_ACCEPTANCE_OUTPUT="$PWD/docs/verification/plugin-style-boundary/final" node docs/verification/plugin-style-boundary/run-native-ant-runtime.mjs
STYLE_SURFACES_OUTPUT="$PWD/docs/verification/plugin-style-boundary/final/regression/official-surfaces" pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.i18n-plugin-visual.config.ts
```

官方 suite 的 JSON reporter 写入 `apps/creator-workbench/test-results/i18n-plugin-visual/results.json`；复制至 `regression/browser-results.json` 后执行 `python3 docs/verification/plugin-style-boundary/final/collect-evidence.py`。完整日志与截图应复制到本目录对应路径，保留原始记录。
