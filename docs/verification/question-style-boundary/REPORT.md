# 问答选项与官方 presentation 样式遗漏修复

日期：2026-10-13（Asia/Shanghai）。本轮专项浏览器验证通过，不替代全产品视觉验收。

## 问题与原因

用户截图中的 `ask_user_question` 选项直接使用 vendor `OptionList`。DOM 按钮既没有 `aui-*` class，也没有 `data-agent-ui-owned` 标记，因此逐元素 scoped preflight 与 Host shield 没有覆盖它们。Tailwind 布局与圆角仍生效，但浏览器默认背景和 `2px outset` 边框保留，形成截图中的原生控件外观。

浏览器夹具同时保留 clean vendor 作为修复前对照。全部 12 个组合都记录到 `2px outset`，与用户截图一致；产品适配后的按钮记录为透明背景、0px 边框、8px padding、border-box。

## 修复和扩查

- 问答选项改为生成的产品 adapter；单选、多选、pending、receipt 和 readonly 保持 upstream 行为。
- 扩查 production presentation 的直接 vendor imports，计划、子任务、折叠控件、Input、Skeleton、Badge、Sources、后续建议和 directive presentation 统一使用生成的 adapter。剩余 direct imports 仅为 task utils 与表面样式常量。
- Badge 使用 upstream `useRender`，因此在生成器的 `defaultProps` seam 标记自身 DOM；不递归标记业务 children。
- OptionList 原有默认确认文案、空选择文案、辅助读屏文案和选中计数进入统一 `questionOptions` namespace，en-US/zh-CN 对齐。
- vendor 未修改，AppUIModel、Slot、Runtime 与插件依赖边界未改变。
- 参考了本地 assistant-ui pinned `3542d602272a62eddeb8989befc910841c267022` 的 OptionList；生成适配的来源和 hash 保存在 adapter `UPSTREAM.json`。

## 实际检查

- `@agent-ui/react build`、`typecheck`、`check:assistant-ui-upstream`：通过。
- `pnpm check:i18n`：通过，failures 为空。
- 浏览器测试 TypeScript 检查：通过。
- Playwright：12/12（light/dark/violet × 420/1440 × zh-CN/en-US）。覆盖修复前对照、默认/hover/focus、禁用、多选、提交等待、已回答、只读、计划/子任务进度、折叠交互、Input/Badge/Skeleton/Sources 的 ownership 与窄屏边界。
- 每例注入 Host 全局 button reset（5px outset 红边、粉底、20px serif 等）后，产品按钮计算样式仍与注入前一致。
- 官方 Collapsible 内嵌业务按钮与 Agent UI 外部业务按钮的计算样式完全一致。
- 问答、只读真实 assistant-ui runtime、样式边界与 quote boundary focused tests：4 files / 16 tests 通过。
- 扩查 Sources/AG-UI 集成、Tailwind 扫描、upstream provenance/guard 与 directive conformance：6 files / 64 tests 通过。

浏览器使用本轮构建后的发布目录 `packages/react/dist`，通过 Vite/Tailwind 加载。该夹具调用公开产品组件，不是真实 Creator 对话或完整生成 Host 的端到端验收。未运行全 workspace CI，未提交或推送。

## Windows

修改的产品代码仅涉及 React presentation、统一 locale 和现有生成机制，不引入进程或原生文件路径行为。生成器继续使用 native path 访问文件、`path.posix` 解析逻辑 imports；浏览器夹具中的文件 import 显式规范化为 `/`。本轮没有真实 Windows 运行，不声明 Windows acceptance。

## 证据和重跑

`question-fixed.png` 是修复后的窄屏问答卡片（额外含一条禁用选项用于验证）。每个组合有 `*-open.png`、`*-answered.png` 和计算样式 JSON。open 截图上方保留修复前 clean vendor 对照。

```sh
pnpm --filter @agent-ui/react build
pnpm --filter @agent-ui/creator-workbench exec playwright test -c playwright.question-style.config.ts
pnpm --filter @agent-ui/creator-workbench exec tsc -p tsconfig.style-boundary-tests.json --noEmit
```
