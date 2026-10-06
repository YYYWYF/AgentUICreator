# Visual design constraints — hand to the visual model

只设计用户最终部署使用的 Agent 前端 UI Plugins。Creator Agent、Creator 工作台、Inspector/DevStudio、Creator dock 和 Atlas 宿主文档页面都不属于改造范围。

输入图片来自真实实现。每张图片的来源、数据和安装状态见 SCREENSHOT-INDEX.md；所有 `*-context.png` 为统一桌面视口上下文，非产品新布局。Development fixture 的外框、留白和示例内容只是摆放真实组件，不得据此添加产品页面结构。

## Must preserve

- Component anatomy, hierarchy, control placement, major spacing and information density.
- Existing icon meanings and button count; textarea/send/cancel/attachment/quote/trigger semantics.
- Progress values and step order, running/completed/waiting distinctions, approval and question submit/receipt semantics.
- Thread navigation behavior, tool disclosure/args/result/error hierarchy, reasoning collapse, Markdown/code/table structures.
- Existing semantic slots and AppUIModel composition. No visual micro-slots, new runtime, page, sidebar category or backend capability.
- Light / Dark / Violet contract; Violet is currently a light scheme. Overlay content inherits the selected root theme.
- Locale-driven UI copy, accessible names, readable text, keyboard focus and status distinctions.

## May change after design approval

Background tint, semantic color mapping, borders, focus ring, shadows, card surface, selected/hover styling, restrained progress/active accents and subtle glow. Do not define exact Violet values in this input-collection phase.

Level 1: semantic tokens only. Level 2: tokens + thin root-scoped CSS at observed stable hooks. Level 3: product-owned Plugin presentation can vary further while retaining its behavior and selected UI stack. Level 4: upstream-sensitive internals; use tokens/public APIs, avoid DOM selector overrides.

No assistant-ui vendor component is directly editable for this theme. Public wrapper ownership does not confer permission to replace upstream internals. Avoid positional selectors, deep descendant chains, generated classes, internal SVG path selectors, and DOM rewrites.

Error red, warning amber and success green may remain semantic. Running/active/selected/focus/relevance/progress can be considered for Violet. Do not indiscriminately recolor every status purple or turn all foreground text into purple.

## Do not invent product UI

禁止添加 Nova logo、Upgrade to Pro、Projects / Knowledge 导航、新 toolbar、新 icon button、不存在的卡片、ChatGPT 式 header、营销区块或任何截图里不存在的产品元素。文件中 shadcn preset 的 `nova` 只是上游 style metadata，不是本产品品牌。

Atlas 文档区是宿主示例，不是 Agent frontend；ThreadList 的 fixture 示范不意味着 embedded 产品具有侧栏。A2UI/Generative UI 可安装资源未在本次默认目标正式装载，不可直接增添到默认产品稿。

Design deliverables should annotate each change with component ID, screenshot reference and freedom level. Start with Light structure; compare current Dark/Violet baselines. Output visual proposals only; implementation follows separately through the owning theme layer or Plugin.
