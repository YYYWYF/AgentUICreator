# 原 Creator B 响应式边界浏览器验收

日期：2026-10-12（Asia/Shanghai）。Creator 约束修复提交：`56e955f1`。

**`PLUGIN_RESPONSIVE_BOUNDARY = FAIL`**

原 B 插件 420px 的 light/dark × zh-CN/en-US 四个组合均有业务容器越界。新增 Creator 生成约束不会追溯修改已交付源码；本轮没有重新生成或修改原插件。

## 受测来源

运行 `run-restored-hosts.mjs`，从此前保留的真实 A/B/C Host 恢复原交付的 Plugin、locale 和 AppUIModel；每个 Host 独立执行 verify:ui、typecheck、build，再执行原浏览器交互脚本。本轮四个 B 专项场景的 index.tsx、styles.css、definition.ts、manifest.json SHA-256 均与仓库保留的真实交付一致，详见 [environment.json](environment.json)、[restored-hosts.json](restored-hosts.json) 和 [专项原始结果](responsive/B-results.json)。未调用 Creator 模型生成新插件。

当前工作区包含已有 Tailwind 依赖清理及 shimmer 样式本地改动，已记录在 environment.json。浏览器运行使用当前构建的 React 包，不能把结果视为纯 `56e955f1` checkout 的全产品验收。本轮没有修改这些已有改动。

## 420px 实测

以下数值取添加两条备注、开关说明弹窗后的相同采样点。

| 主题 / locale | 父容器 clientWidth / scrollWidth | Plugin rect.width / x | 根 box-sizing / min-width / padding / max-width | 响应式结论 |
| --- | --- | --- | --- | --- |
| light / zh-CN | 279 / 303 | 303 / -8 | content-box / 0px / 12px / none | FAIL |
| light / en-US | 279 / 303 | 303 / -8 | content-box / 0px / 12px / none | FAIL |
| dark / zh-CN | 279 / 303 | 303 / 4 | content-box / 0px / 12px / none | FAIL |
| dark / en-US | 279 / 303 | 303 / -8 | content-box / 0px / 12px / none | FAIL |

根节点自身 `scrollWidth === clientWidth === 303`，但父容器 `scrollWidth=303 > clientWidth=279`。根和父容器都是 `overflow:hidden`，因此不能凭根节点等宽或没有可见横向滚动条判定通过。根 CSS width 为 279px，再加 24px 横向 padding，实际占用 303px。

三个组合标题/Input 的 x=4，位于父容器左边界 x=16 外侧，截图确认左侧裁切；dark / zh-CN 在该采样点 x 不为负，仍超出父容器可用宽度。440 字符无空格备注可以换行，但没有消除根容器尺寸问题。记录涵盖初始状态、两条备注后、Modal 后、长文本后，以及标题、Input、添加 Button、List/List item 的矩形及 scroll metrics。

四个组合的 Modal 均为 x=8、width=404、right=412，clientWidth/scrollWidth=404，opacity=1，位于 420px 视口内；Tab/Shift+Tab、Esc、再次打开/关闭及 trigger 焦点返回完成。Modal 内的原生按钮与内容可见。截图抽查 [light zh-CN 裁切](responsive/B-420-light-zh-CN-failure.png) 和 [dark en-US Modal](responsive/B-420-dark-en-US.png)。

原回归脚本 B 窄屏为 2 FAIL / 2 PASS：它只判断是否超出 viewport，没有比较父容器 scrollWidth/clientWidth。本轮专项为所有组合增加父容器测量，四个组合均为响应式 FAIL。专项 dark/zh-CN 原脚本另报 `Host theme mismatch: border`（实际 Input 与宿主控件采样状态不同），原始错误保留；该错误不替代响应式失败，也不用于判定原生 AntD 复用退化。参见 [独立响应式汇总](responsive/summary.json)。

## 回归结果

**`PLUGIN_STYLE_BOUNDARY = PASS`**（本轮原生控件、typography、Modal/Portal、fake slot 和官方组件回归范围）。与原 B 业务响应式 FAIL 独立记录。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| A/B/C × 1440/420 × light/dark × zh-CN/en-US 原生 UI 复用 | 24/24 PASS | style-boundary/computed-raw，各控件 computed styles、hover/focus/active/disabled、Card/List、fake slot、Modal 绘制/键盘 |
| Sidebar / 官方 Dialog 嵌套 | 6/6 PASS | 官方本地 Portal ancestry、业务控件不带 ownership、computed styles；嵌套宽度差异保留，其他样式比较 |
| 显式宿主 typography | 2/2 PASS | style-boundary/computed-raw/explicit-Host-typography-*.json |
| 实际 PluginInstanceRenderer 原生 AntD | 8/8 PASS | runtime-native-ant.json；仅独立 disposable fixture 替换为原生探针，未替代原 B 响应式验收 |
| 原 Creator A / C 插件回归 | 各 8/8 PASS | visual/creator-regression/A-results.json、C-results.json |
| 原 Creator B 旧回归 | 6/8 PASS、2/8 FAIL | visual/creator-regression/B-results.json，保留旧脚本的局部 PASS |
| 原 Creator B 420px 响应式专项 | 0/4 PASS、4/4 FAIL | responsive/summary.json、B-results.json |
| 官方完整浏览器回归 | 128/128 PASS，无 skip/flaky | official-browser-results.json、checks/official-controls.log、official-surfaces、official-details |
| 恢复 Host 的 verify:ui / typecheck / build | A/B/C 全部 PASS | restored-hosts.json、checks/final |
| React build / i18n / upstream | PASS | checks/react-build.log、i18n.log、upstream.log |

抽查实际 Runtime dark/en-US 420px Modal 截图，确认弹窗及 Input 绘制可见。样式专项实际 32 个测试全部通过，原始 computed 文件逐一核对其 status。官方完整回归 JSON 的 expected=128、unexpected/skipped/flaky=0。

验收结论：生成约束与静态检查已交付，但原真实 B 的响应式最终目标未达到。不能签署 `scrollWidth === clientWidth` 或原 B 整体 PASS。本轮未做修复、重新生成或新 Creator 模型验收。

## 重跑

```sh
mkdir -p docs/verification/creator-plugin-responsive-boundary/browser/checks/final
STYLE_ACCEPTANCE_OUTPUT="$PWD/docs/verification/creator-plugin-responsive-boundary/browser" node docs/verification/plugin-style-boundary/run-restored-hosts.mjs
node docs/verification/creator-plugin-responsive-boundary/browser/run-responsive.mjs
STYLE_ACCEPTANCE_OUTPUT="$PWD/docs/verification/creator-plugin-responsive-boundary/browser/style-boundary" pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.style-acceptance.config.ts
STYLE_ACCEPTANCE_OUTPUT="$PWD/docs/verification/creator-plugin-responsive-boundary/browser" node docs/verification/plugin-style-boundary/run-native-ant-runtime.mjs
STYLE_OFFICIAL_OUTPUT="$PWD/docs/verification/creator-plugin-responsive-boundary/browser/official-details" STYLE_SURFACES_OUTPUT="$PWD/docs/verification/creator-plugin-responsive-boundary/browser/official-surfaces" pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.i18n-plugin-visual.config.ts
```

Host 恢复和依赖路径沿用既有 runner，需要此前保留的 fixture。专项 runner 复用原验收动作，增加根/父容器测量和长内容，不改写受测源码。原始警告（AntD 5 / React 19 compatibility、node_modules/lockfile 配置不同步）保留在日志中。
