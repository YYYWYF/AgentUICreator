我是 Agent UI 的 Creator 助手。下面按“我能做什么”+“你这个项目现在什么样”两部分说明。

## 一、我能帮你做的事

**1. 看懂现状（我现在就在做）**
- 读取当前 AppUIModel、Slot 结构与 Active Composition，解释界面为什么长成这样。
- 查询某个插件是否已启用、放在哪个 Slot、依赖哪些服务。
- 区分「UI 已出现」「配置存在」「后端联通已验证」三件事，不把存在当成可用。

**2. 规划与解释**
- 讲解某一类需求可以用现成插件满足，还是需要自己写。
- 讲解 Conversation Runtime、AG-UI 消息渲染、前端工具、Application Events 等能力怎么用。
- 给出布局（Row / Column / Stack / Panel / Slot）、尺寸、嵌套的调整方案。

**3. 改组合（需 Host 放行写入）**
- 加 / 删 / 启用 / 停用插件实例，移动、隐藏、调整 Slot 归属与 Layout。

**4. 改代码**
- 编辑项目自有插件源码（`src/agent-ui/plugins/*`）、服务契约（`src/agent-ui/services/*`）、主题样式与外壳样式。
- 官方 npm 包保持 vendor 不动，只在项目层做封装与样式覆盖。

**5. 排查与验证**
- 针对报错、白屏、插件不加载、类型/组合校验失败做诊断。
- 观察真实渲染结果（矩形、容器结构、mode 属性、计算样式）来验证几何效果，而不是靠推断。
- 按明确的验收条件做只读结果核对。

**边界**：本次是只读路由，我没有写入权限；任何组合或代码改动都需要 Host 审批后才能执行。

## 二、当前项目状态（截至本次检查）

项目源目录 `src/agent-ui`，共 46 个插件：22 个已组合且启用，24 个未组合。

已装好的主链路：
- **会话主体**：conversation-surface（p8），内含消息流、输入区、空状态建议。
- **输入区**：composer（p10）+ 附件（add-attachment-action）+ 发送/停止（submit-action）+ 引用（conversation-quote）。
- **历史侧栏**：conversation-thread-list（p6）+ 新建会话（conversation-new）。
- **助理消息呈现**：reasoning、tool-group、tool-result（多模态工具结果）、context-retrieval-message、transient-assistant-messages。
- **回复脚注**：response-footer + 复制 / 重新生成 / 导出 Markdown。
- **服务层**：会话数据源、会话服务、语言服务、主题服务 —— 4 个均 `available`，依赖方全部解析成功，无 issues。
- **品牌标识**：agent-identity 位于左侧栏顶部。

几个常见的「还没装但随时可加」的：主题切换（theme-switch）、中英文切换（locale-switch）、回复点赞点踩（feedback-actions）、引用来源（source-citations-message）、SubAgent 任务卡（task-group）、工具时间线（tool-timeline）、登录门禁（auth-gate / auth-account）、提问卡片（ask-user-question）、语音输入（dictation-action）、斜杠命令与 @ 提及。

## 三、想让我继续，可以直接说

- 「把这个项目的界面结构讲给我听」
- 「加上主题切换和中英文切换」
- 「会话区太窄，调宽一点」
- 「改一下开场推荐问题 / 欢迎语」
- 「把配色改成蓝白、整体简洁一点」
- 「我的后端返回 xxx，能渲染出来吗？」

告诉我具体目标，我会先取最新现状，再给出方案；涉及改动的会走 Host 审批。
