# Creator 生成插件响应式约束修复

日期：2026-10-12（Asia/Shanghai）

`PLUGIN_RESPONSIVE_BOUNDARY = NOT_RUN`

按用户最后指令「做完推送，不要验收」交付生成约束和静态风险检查，未执行浏览器验收。

## 问题证据与来源

沿用 [原 B 失败报告](../plugin-style-boundary/REPORT.md#未通过原-creator-b-插件窄屏越界)：420px viewport 的插件 Slot 为 279px，原业务根容器的 `width:100% + padding:12px + content-box` 产生 303px 内容尺寸，交互后 x=-8px，标题和 Input 裁切。本轮没有重新运行复现，没有重新生成或修改原插件。

生成入口是 Python Creator 的 domain prompt 和 `create_ui_plugin` 工具，开发指南随 Creator 包发布。创建服务接收模型提供的文件，并非固定 CSS starter；因此在现有开发 Skill 中加入可复制的 Plugin-owned 根样式示例，没有引入新模板系统。

## 修改

- Prompt、创建工具说明、Plugin 开发 Skill 明确 420px viewport / 279px Slot，根节点 `box-sizing:border-box; min-width:0; max-width:100%`，flex/grid child shrink、长文本换行、控件及 Modal 宽度约束。
- `verifyUIProject` 的现有 Plugin CSS 解析流程输出独立 `PLUGIN_RESPONSIVE_*` warnings：同一规则的 `width:100% + 非零 padding` 缺少 border-box、显式 `min-width:auto`、可明确识别的根节点固定宽度超过 279px 且没有 `max-width:100%`。
- 警告包含 Plugin ID、文件、行号、selector。保持样式隔离 errors 独立，避免把已有业务代码的启发式风险升级为所有项目的新阻断条件。
- 检查范围为 project-owned Plugin `.css`。不推导 cascade、根节点 ancestry、跨规则继承；inline styles、CSS-in-JS、utility classes 和任意命名根节点需要模型按生成规范审查。警告提示不等于实际 overflow 判定，也不自动改写业务源码。

未修改 Agent UI preflight/Root、vendor、Plugin Runtime、Portal、样式隔离实现或 AntD 兼容逻辑。未包含工作区已有的 React 样式、Tailwind 构建及依赖清理改动。

## 静态验证

| 检查 | 结果 |
| --- | --- |
| Plugin style verifier focused tests | PASS，5 tests，包括风险发现、可收缩安全样式及警告输出 |
| Project Control typecheck | PASS |
| Python prompt/tool py_compile | PASS |
| `pnpm --filter @agent-ui/react build` | PASS |
| `pnpm check:i18n` | PASS |
| `pnpm check:assistant-ui-upstream` | PASS |
| `git diff --check` | PASS |
| 420px light/dark × zh-CN/en-US 原 B 浏览器验收 | NOT_RUN，用户明确要求跳过 |
| style boundary browser tests / AntD、fake slot、官方组件、Portal、A/C 回归 | NOT_RUN，用户明确要求跳过 |

执行时 pnpm 提示 node_modules 与 lockfile 配置不同步；未安装依赖或修改该已有状态。

既有 [样式边界专项报告](../plugin-style-boundary/final/REPORT.md) 保留原结论，不作为本轮回归证据。原 B 的越界不会由新增 Prompt 追溯修复；由于本次明确不修改已有插件且不做验收，不能签署原 B 的 `scrollWidth === clientWidth`，也不能签署本轮响应式 PASS。
