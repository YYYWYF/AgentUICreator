# AgentUICreator Violet — 真实 UI 设计输入包

把本目录的文档和截图交给视觉设计 AI。**只设计用户最终部署使用的 Agent 前端 Plugins；Creator Agent、Creator 工作台、Inspector、Creator dock 和宿主页面不在范围内。** 本阶段未实现 Violet 主题，未修改生产插件、主题 token 或 assistant-ui vendor。

先读 [VISUAL-DESIGN-CONSTRAINTS.md](VISUAL-DESIGN-CONSTRAINTS.md)，再看 [Top 10 截图](SCREENSHOT-INDEX.md#top-10--feed-these-to-the-visual-model-first) 与 [Ownership / Upgrade Risk 表](UPGRADE-BOUNDARIES.md)。其余文档为 [UI 盘点](UI-INVENTORY.md)、[主题链路](THEME-ARCHITECTURE.md)、[写死颜色审计](HARDCODED-COLOR-AUDIT.md)。完整截图和采集记录都在 `screenshots/`。

## Collection summary

| 指标 | 数量 / 说明 |
| --- | --- |
| Total UI surfaces | 33 个设计域，见 surface-matrix.json；不是 33 个独立 React export |
| Upstream-backed | 31 个域使用 upstream presentation / primitives，包含 product adapter |
| Fully product presentation | 2 个域：Chart、Frontend form/dialog demos；产品流程还包含 Welcome、QuestionFlow 等组合层 |
| Source Registry visual entries | 32 个视觉/组合入口；包含部分 headless provider，不能全部等同于可见组件 |
| Token-only (Level 1) | 4 个域 |
| Compatibility consideration (Level 2) | 17 个域 |
| Product-owned presentation/orchestration (Level 3) | 4 个域；其中使用 upstream 的子组件仍不可改 vendor |
| Upstream-sensitive (Level 4) | 8 个域 |
| Color audit | 146 条匹配行；其中 104 条为标准 token 声明，5 条 upstream 品牌型蓝色候选 |
| Screenshots captured | 47 场景 × 主图/近景 + 上下文 = 94 PNG；桌面 1440×900，窄屏 390×844 |
| Browser capture errors | 0（两个最终 capture manifest）；采集脚本问题已在开发 fixture 内修正 |
| Missing states | 图片缩放、Quote 选区工具栏、嵌套 TaskGroup、Thread action 菜单、安装态 form/dialog lifecycle、未装载的 A2UI/Generative UI，以及部分 hover/disabled/loading/receipt 状态，见截图索引 |

## 交给设计 AI 的提示

> 请基于本包 Top 10 的真实截图提出现代 AI Violet 视觉稿。保留实际组件结构、信息层级、主要间距、按钮数量和位置、交互模型与状态语义。按 Ownership 表遵守每个组件的 Freedom Level，只考虑 semantic tokens、很薄的 scoped compatibility CSS 或 product-owned Plugin 的视觉处理。禁止新增 Logo、Upgrade、Projects/Knowledge 导航、toolbar、按钮或卡片。不要改 Creator，不要改 assistant-ui vendor，不要把开发 fixture 留白或 Atlas 宿主页面当作产品布局。先输出视觉稿，不实施代码改造。

## Reproduce in the repository

Source commit: `662774fb8c3935584e03abf7ececea08c3d89110`, branch `dev`, collected 2026-10-05. Pinned assistant-ui: `3542d602272a62eddeb8989befc910841c267022`.

Existing embedded generated foundation is older than registry theme APIs. Existing-target shots 01–03 and current public fixture shots are labeled separately. Do not regenerate the target merely to hide that difference.

The fixture is `examples/creator-embedded-host/dev/violet-input/`; it is outside production HTML entrypoints and the target's production `src` typecheck include. It imports actual components/Plugin CSS. Outer sizing only; no copies of component anatomy or theme override styles. Mock attachment adapter and test sources are development-only.

Run the dev server directly to avoid `predev` regeneration:

```sh
pnpm --filter @agent-ui/creator-embedded-host exec vite --host 127.0.0.1 --port 5186 --strictPort
```

Then, from workspace root:

```sh
python3 docs/design/violet-theme/scripts/collect-source.py
node docs/design/violet-theme/capture.mjs
node docs/design/violet-theme/capture-extra.mjs
python3 docs/design/violet-theme/scripts/index-screenshots.py
pnpm --filter @agent-ui/creator-embedded-host exec tsc -p dev/violet-input/tsconfig.json --pretty false
```

`VIOLET_INPUT_URL` can select another local dev-server URL. Playwright resolves through the existing workbench dev dependency; it is not added to the generated production project. The fixture tsconfig adds JSX type resolution for registry template source imported directly in development; generated projects normally own the copied Plugin source.

## Verification / observations

- Both capture runs finished with zero browser page errors. Screenshot dimensions and nonempty files verified; visual contact sheet and selected originals reviewed. Primary screenshots keep the real DOM and current colors.
- Fixture typecheck passed. Existing theme-contract/theme-dark-variant tests: 2 files / 4 tests passed. Capture scripts passed Node syntax checks. No production build was run because no production source changed.
- Selected Mention/Slash result images show encoded directives as textarea text in this public Composer fixture. Do not assume rich chip presentation or add it to the visual design without product approval.
- Question selected state is submitting/waiting for a result receipt, not a completed receipt.
- Chart uses the actual Plugin CSS; foundation CSS must load before Plugin CSS in the development fixture. No CSS override was added for capture.
- PDF attachment tile is captured using the real official demo adapter and mock PDF bytes. This validates attachment presentation, not PDF content or upload storage.
- Other concurrent workspace edits are outside this collection and were not touched. This task adds only this directory and the isolated development fixture.
