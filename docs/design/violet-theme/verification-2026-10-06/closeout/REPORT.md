# Violet 收口验证 · 2026-10-06

## 修复

- 锁定的 Generative UI 0.0.22 确实支持 Slider、CheckboxGroup、Input.defaultValue 和 `$field`；测试验证真实初始值与编辑后的 action payload，不再断言能力缺失。
- A2UI ChoicePicker 单选/chips 使用官方 RadioGroup；按可访问名称验证两个独立组、初始 Business、用户选择 Seoul 和 Save continuation。
- project-control 的旧 fixture 补齐 `.agent-ui/project.json`，将数据放进受管 `agent-ui` sourceRoot，使用真实路径解析；没有修改生产校验。
- Violet Form 在产品自己的 CSS 里统一白色卡片、中性边框、576px 最大宽度、40px 输入/按钮、8px 控件圆角、排版与反馈。仅增加现有 actions wrapper 的稳定 data-slot。
- Violet focus border 使用 solid token；既有 1px halo 增至20%。稳定控件 hook 使用2px实色 outline、2px offset；新增对白色背景至少3:1对比度契约。Light/Dark 与 Host 不匹配这些规则。

## 本地验证

- 原扩展套件：57/57（原56项 + 新focus契约）。
- `pnpm verify:assistant-ui-upgrade`：通过。upstream provenance guard；React 81/81；project-control 39/39；浏览器 Host/Row/Portal 3/3。
- `pnpm --filter @agent-ui/react build` 和 `typecheck`：通过。
- Source registry identity/catalog：6/6。
- `git diff --check`：通过；assistant-ui vendor无改动。

## 真实截图

[index.html](index.html)：Form idle/error/success、390px窄屏、Light/Dark对照，Button键盘焦点和Popover Escape返回焦点，共8张。窄屏 DOM clientWidth=scrollWidth=390，Form width=294；全尺寸Form实际width=576，按钮height=40、radius=8。

原46张截图保留为上一轮证据，Form与focus以本目录的新截图为准。蓝色running等既有visual delta保留，不补脆弱selector。

## 服务端 CI

此前 `9c0dd44b` 确实触发了push CI，结论为failure：[运行58](https://github.com/YYYWYF/AgentUICreator/actions/runs/37406808865)。不是没有workflow run。
本轮将扩展回归纳入正式gate，workflow显式执行升级gate和React build。第一轮修复提交 `f4bc79f4` 的[运行59](https://github.com/YYYWYF/AgentUICreator/actions/runs/37408557317)确认 clean checkout 下 React 81/81 和 project-control 39/39，通过后在 Host 初始化发现缺少直接 Lexical 依赖，浏览器测试尚未开始。Embedded Host 的 package.json/lockfile 已补齐6项锁定依赖；没有放宽初始化检查。后续运行结果以 GitHub Actions 为准，本地通过不能替代 clean CI 证据。
