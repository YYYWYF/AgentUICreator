# Agent UI 插件样式隔离：最终浏览器验收

日期：2026-10-10，Asia/Shanghai。

**`PLUGIN_STYLE_BOUNDARY = NOT_ACCEPTED`**

原生宿主组件复用、24 个基础场景、官方组件和 Portal 检查通过。原 Creator B 业务插件仍存在 420px 越界，不能签署整体 PASS。

## 源码与构建基线

- 开始时 HEAD：`0f11a3fa27720078f6127baffab0e33c7f91a9c2`。先构建该提交并执行 B 对照及 A 失败复现。
- 核对期间出现新提交：`de80131ba70f8345ae8b11959ee3fbadd98b81b9`，提交了开始时已存在的 typography 修改。最终验收基线使用此 HEAD，加上本轮两项修复；验收执行时这些改动尚未提交。验收完成后按用户要求提交并推送。
- 包含样式隔离提交 `7b1d2a6518a024bf5a89840d3f6cb8b1c320d805`。
- 最终浏览器使用重新构建的 React `dist`。源码与构建 CSS 的 SHA-256、版本和 vendor 差异记录见 [environment.json](current/environment.json)。AntD 为 5.29.3，React 为 19.3.0，Playwright 为 1.63.0。
- `packages/react/src/internal/vendor/assistant-ui` 无修改；upstream 校验通过。adapter 生成与 provenance 校验通过。
- [源码差异](current/source.patch)及[新生成的 Button adapter](current/generated-button-adapter.tsx)保留实际受测实现。开始时差异保存在 [preexisting.patch](current-before/preexisting.patch)。

上一轮报告保留为 [REPORT-0f11a3fa.md](REPORT-0f11a3fa.md)，其结果不能替代本轮证据。

## 本轮最小修复

先运行浏览器，再修改框架样式边界；没有修改业务插件、vendor、Plugin Runtime 或宿主组件 tokens。

1. **fake slot 被误识别为官方组件。** 浏览器复现 `data-slot="button" class="group/button"` 业务按钮的 padding 从 `1px 6px` 变成 `0px`，边框从 `2px outset` 变成 `0px solid`，字体及背景也改变。生成官方 `ui/button` product adapter，并让产品调用使用此 adapter；官方 Button 显式带 ownership。删除 baseline/shield 中通用 slot + class 的 ownership 推断，没有扩张 selector。
2. **暗色原生控件受到 `color-scheme` 继承影响。** 移除误识别后，暗色 fake button 的默认背景仍从 `rgb(239,239,239)` 变成 `rgb(107,107,107)`。沿用现有 `.app-ui-plugin-instance` 边界，捕获并恢复宿主 `color-scheme`；官方 presentation root 保持 Agent UI 的 scheme。没有库专用 reset。

失败前的截图、计算样式和日志位于 [current-before](current-before/) 与 [checks/current](checks/current/)。15 份修复前/后的官方桌面快照比较中，控件高度、padding、圆角、边框均无变化，见 [official-geometry-comparison.json](current/official-geometry-comparison.json)。这项对照覆盖记录中的快照，不代表全产品已有像素 golden。

## 最终结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| A/B/C × 1440/420 × light/dark × zh-CN/en-US | **24/24 PASS** | 每例页面、宿主弹窗、插件弹窗截图及 computed styles |
| B 原生 AntD Input/Button/Card/List/Modal | **PASS** | 原生控件无修复 CSS；统一 ConfigProvider/theme/props |
| B 实际 PluginInstanceRenderer 挂载的原生组件 | **8/8 PASS** | [runtime-native-ant.json](current/runtime-native-ant.json)，含插件实例 ancestry |
| A/C 原生 Design System 组件 | **16/16 PASS** | 使用原 Design System React Button/Input/Card 与原 stylesheet |
| Sidebar / 官方 Dialog 内嵌业务组件 | **6/6 PASS** | [computed-raw](current/computed-raw/)；公共 API 的本地 Portal 容器断言 |
| fake slot | **24/24 PASS** | 所有基础场景均比较业务 fake button 与宿主原生对照 |
| 官方完整浏览器回归 | **128/128 PASS** | [browser-official.log](checks/current/browser-official.log) |
| 官方 owned controls / Rename / Sidebar overlay | **8/8 PASS** | [browser-owned-controls.log](checks/current/browser-owned-controls.log) |
| 原 Creator A 插件 | **8/8 PASS** | [A evidence](visual/A/creator/) |
| 原 Creator C 插件 | **8/8 PASS** | [C evidence](visual/C/creator/) |
| 原 Creator B 插件 | **FAIL** | 完整回归 4 个窄屏组合失败；专项复现 3 个组合失败 |
| React build / typecheck / 浏览器测试 typecheck | **PASS** | [build.log](checks/build.log)、[typecheck.log](checks/typecheck.log) |
| upstream / adapter / i18n / focused tests | **PASS** | [检查日志](checks/current/)，focused tests：4 files / 9 tests |

## 覆盖与证据索引

- [Ant Design computed styles](computed-styles/ant-design.json)：完整 Input 属性，包括 width、height、四边 padding、border-width/radius、font-size、line-height、color、background；Button 包含 hover、focus、active、disabled；Card 同时测量外层和 `.ant-card-body` padding、border、shadow。
- [Design System computed styles](computed-styles/design-system.json)：A/C 的相同对照，保留原生声明，无 typography/box-sizing 测试补丁。
- [A 截图](visual/A/)、[B 截图](visual/B/)、[C 截图](visual/C/)：24 个基础场景各有页面及两种弹窗截图；`creator/` 保留原 Creator 插件，B 的 `runtime/` 是实际 Runtime 挂载的干净原生组件。
- [官方表面截图与计算样式](current/official-surfaces/)、[官方交互截图](current/official-interactions/)、[动画和 Markdown 详细记录](current/official-details/)。
- 官方覆盖 Composer 高度/发送按钮/Trigger/focus，Sidebar 展开、关闭、搜索、会话选择与 Rename，ToolTimeline 布局/详情/键盘展开、Thinking 占位高度和实际动画时间推进，以及 Markdown code block、quote、list。
- B Modal 验证 body Portal、固定全视口遮罩、打开、Tab/Shift-Tab、Esc 和 trigger 焦点返回。官方 Dialog 验证实际位于 Agent UI 本地 Portal；业务 Input 不带 ownership。
- C 的原 Creator 输出仍从 `../../../design-system` 导入组件，同时保留 AntD 安装；浏览器确认实际 Input 为 `acme-input`。见 [component-selection.json](current/component-selection.json)。这是原真实 Creator 输出回归，没有重新调用模型生成插件。
- 72 张基础页面/弹窗截图及 30 份最终计算样式记录经 [collect-evidence.py](current/collect-evidence.py)核对。汇总见 [summary.json](current/summary.json)。

第一轮完整矩阵为 23 PASS / 7 FAIL，日志原样保留。其余问题是夹具混用私有 Dialog 和公共入口造成 context 分离、嵌套容器宽度不同，以及 Modal/自动 focus 的动画采样时刻。夹具改为公共 API、在同一默认交互状态及动画稳定后比较；容器宽度差异保留原值，并仅在嵌套容器比较中排除 width，等宽基础场景仍完整比较 width。补测 B 全部 8 个基础场景（含 Card body）和全部 6 个嵌套场景，**14/14 PASS**，见 [browser-stable-rerun.log](checks/current/browser-stable-rerun.log)。没有删除原始失败记录或把它们改写为 PASS。

## 未通过：原 Creator B 插件窄屏越界

复现：打开原 B Host，选择 420px、zh-CN、light，打开业务备注，添加两条备注，滚动第二条，打开/关闭说明弹窗，再检查插件边界。dark/其他 locale 也曾失败。

- 宿主插件容器宽度：`279px`。
- 原插件声明：`width:100%`、`padding:12px`、`box-sizing:content-box`。
- 实际插件宽度：`303px`；交互后左边缘：`x=-8px`，标题与输入框左侧被裁切。
- Input 字体已恢复为 `16px / normal`；此阻塞来自原业务面板的尺寸声明，而非干净 AntD 控件自身样式不一致。

[失败截图](visual/B/creator/B-420-light-zh-CN-failure.png)、[当前 computed layout 与 ancestry](current/B-layout-diagnostic.json)、[完整回归日志](current/checks/final/B-creator-regression.log)、[专项复现日志](checks/current/B-layout-diagnostic.log)。完整回归的 4/4 窄屏失败与专项复现的 3/4 失败均保留；滚动/焦点时刻影响是否暴露裁切，不能以其中一次通过签署窄屏 PASS。

原插件带有先前交付的主题 CSS，源码与哈希未改变。它只用于原交付回归，不作为“无补丁原生 AntD 复用”证据。本轮未添加业务 CSS、AntD hack 或全后代 reset 来覆盖其尺寸问题。

因此，尽管干净组件、A/C、官方组件和 Portal 均通过，**整体仍保持 `NOT_ACCEPTED`**。

## 重跑

```sh
pnpm --filter @agent-ui/react build
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.style-acceptance.config.ts
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.i18n-plugin-visual.config.ts
STYLE_EVIDENCE="$PWD/docs/verification/plugin-style-boundary/current/owned-controls" pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.style-boundary.config.ts
STYLE_ACCEPTANCE_OUTPUT="$PWD/docs/verification/plugin-style-boundary/current" node docs/verification/plugin-style-boundary/run-restored-hosts.mjs
STYLE_ACCEPTANCE_OUTPUT="$PWD/docs/verification/plugin-style-boundary/current" node docs/verification/plugin-style-boundary/run-native-ant-runtime.mjs
STYLE_ACCEPTANCE_OUTPUT="$PWD/docs/verification/plugin-style-boundary/current" node docs/verification/plugin-style-boundary/diagnose-B-layout.mjs
python3 docs/verification/plugin-style-boundary/current/collect-evidence.py
```

需保留原 Host skeleton/dependency install；路径与 override 见 runner 源码。AntD 的 React 19 compatibility warning 原样记录，没有将其作为视觉通过依据。此次没有运行全 workspace CI、重新生成 Creator 业务输出或执行 release acceptance。
