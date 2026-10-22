# 全站文档目录与内容归属复查

日期：2026-10-23。范围：`website/docs/` 全部 138 篇文章与首页，含顶栏、侧栏、章节概览、页内链接和交叉主题。

## 从用户任务决定入口

| 用户此刻的目标 | 唯一主入口 | 该章节负责什么 |
| --- | --- | --- |
| 第一次把 Agent 前端跑起来 | 开始使用 | 从安装到初始化、挂载、首次对话与第一次修改。 |
| 判断成品能做到什么 | Agent 前端能力 | 成品交互及使用方法，说明数据和服务前提。 |
| 让 Creator 修改现有界面 | Creator 开发指南 | 工具启动配置、工程任务、结果会话及 Mock 联调。 |
| 选择或开发具体 UI Plugin | 插件 | 官方组件的选用、Props、前提，以及创建、开发与定义参考。 |
| 接到业务页面、服务并上线 | 应用接入与部署 | React/Web Component 挂载、应用参数、业务服务、公开接口与生产发布。 |
| 手动改布局、样式和展示逻辑 | 定制与扩展 | 应用层组合、文案样式、状态事件与 renderer，必要时接管实现并验证。 |
| 确认支持环境并升级 | 版本与更新 | 兼容性、发布记录、依赖升级、实现同步、工具更新及恢复。 |
| 已经遇到错误 | 故障排查 | 按症状定位故障、找到日志并提供最小复现。 |

首页按这些任务说明各部分用途；「文档导航与 AI 阅读」提供完整入口表。首次教程与日常开发相互链接，已有工程用户无需重走安装。

## 发现并处理的问题

1. **Creator 分组嵌套过深，环境组混排。** 改为启动配置、工程任务、结果会话与模拟联调四组；全站侧栏统一为一层主题分组加文章。
2. **通用诊断误归 Mock。** 移到故障排查，说明 Creator、应用、业务 Agent 和发布问题分别从哪里取证，移除普通用户无需调用的内部诊断接口描述。
3. **创建插件与插件开发入口分散。** 创建与注册指南归插件，和开发能力示例、定义/生命周期参考放在同一组。定制章节链接过去。
4. **连接业务服务与定制 UI 混排。** 附件/语音/反馈适配器及前端工具执行接入归应用接入；渲染器、命令扩展、状态事件仍归定制。
5. **五篇配置说明留在插件目录且没有导航。** 语言配置、会话恢复、历史地址归应用接入；默认主题和命令来源归定制。五篇均恢复直接侧栏入口。
6. **版本支持与更新维护分成相邻菜单。** 发布记录、兼容性、限制归版本与更新，与升级操作和恢复形成一条主线。
7. **参数及结果状态重复讲解。** Agent 参数页负责配置位置；语言/会话/地址专页负责具体步骤；Host API 保留签名；对话参考负责绑定、恢复与适配器。回执页讲查看和验收，结果状态页统一解释状态表。
8. **基础能力、可选实现和支持限制混淆。** 可选实现页聚焦是否增加 Lexical/Generative UI 等实现；测试连接说明归验证定制；插件侧栏取消笼统的「高级」标签，以正文中的实际服务和依赖前提判断适用性。
9. **两种 Mock 路线容易混用。** 首次教程明确 Vite 内置 Mock 与 Creator 独立服务二选一，并核对请求地址；日常 Mock 指南继续负责场景、回放与定制。
10. **章节首页缺少明确边界。** 补齐能力、工具、插件、接入、定制、更新与排障之间的选择提示，避免用户只凭技术名称猜入口。

## 本轮文章迁移

| 原位置 | 新位置 |
| --- | --- |
| `guide/mock/diagnostics.md` | `troubleshooting/diagnostics.md` |
| `customization/create-plugin.md` | `plugins/create-plugin.md` |
| `customization/attachments-dictation-feedback.md` | `integration/attachments-dictation-feedback.md` |
| `customization/frontend-tools.md` | `integration/frontend-tools.md` |
| `plugins/locale-provider.mdx` | `integration/locale-configuration.mdx` |
| `plugins/conversation-service.mdx` | `integration/conversation-binding.mdx` |
| `plugins/conversation-data-source.mdx` | `integration/history-endpoint.mdx` |
| `plugins/theme-provider.mdx` | `customization/default-theme.mdx` |
| `plugins/conversation-command-source.mdx` | `customization/command-source.mdx` |
| `releases/index.md` | `updates/release-notes.md` |
| `releases/compatibility.md` | `updates/compatibility.md` |
| `releases/limitations.md` | `updates/limitations.md` |

其余文章路径保留。迁移只调整文档位置与链接，未改变协议、Plugin ID、项目配置字段或产品行为。

## 保留的合理交叉

- 首次教程保留完成第一次操作所需的最小配置；日常指南负责范围、异常与持续迭代。
- 能力页讲用户体验，Plugin 专页讲选用、参数和前提，业务接入讲服务实现要求；同一功能在三个视角中的说明通过链接衔接。
- Plugin 专页保留必要的启用和验证摘要，便于从搜索直接进入；不删除独立阅读所需内容。
- 源码接管归定制，已接管实现同步归更新；首次取得所有权与后续维护是不同任务。
- 排障页按症状定位，更新恢复页说明实际恢复阶段；互相链接并保留各自入口。

## 检查方式

新增 `website/scripts/check-docs.mjs`，由文档包的 `check:docs` 脚本执行：

```sh
pnpm --filter @za38.03/agent-ui-docs check:docs
pnpm --filter @za38.03/agent-ui-docs build
pnpm --filter @za38.03/agent-ui-docs check:docs --built
pnpm --filter @za38.03/agent-ui-docs typecheck
```

检查每篇文章有且只有一个所属侧栏入口、导航目标存在、菜单归属、最大层级、站内链接和本地资源。构建后进一步核对每篇 HTML 的侧栏入口和链接锚点；使用 Node 原生路径访问文件，用 POSIX 逻辑路径处理路由，兼容 Windows。

本次检查为用户任务、目录与正文的语义审查及静态构建验证，不代表浏览器视觉、真实后端或所有平台安装验收。

## 本次验证结果

在 Windows 实机环境执行：文档构建、文档 TypeScript 类型检查及 `check:docs --built` 均通过。138 篇原有文章全部保留，分属 8 个菜单；每篇有且只有一个侧栏入口，文章深度最多为一层分组后的子项。529 处本地链接、生成 HTML 的侧栏与页面锚点通过检查。12 篇迁移文章均出现在生成的 Markdown/LLM 索引中。审查记录与写作计划的相对文件链接也已核对。
