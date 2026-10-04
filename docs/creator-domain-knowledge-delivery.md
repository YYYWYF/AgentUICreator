# Creator 领域知识交付记录

这份记录供维护者阅读，不会装载到 Creator 模型上下文。

## 能力与知识归属

| 任务 | 常驻边界 | 按需知识 | 当前事实和执行入口 |
| --- | --- | --- | --- |
| 普通 Composition | AppUIModel 归属、事实先于操作 | `app-ui-model`；只有低层 Layout 才读 `ui-layout` | `inspect_ui_project`、`mutate_app_ui_model`；Host 语义快速路径不强制读 Skill |
| Plugin 复用或开发 | 优先复用、开发须有任务授权 | `ui-plugin-development` 及定向 references | 现有 Plugin、正式 Source Item、`prepare_ui_plugin_development` 和源文件工具 |
| AG-UI 交互 | 单 Agent Runtime、Runtime/Framework 只读 | `ag-ui-frontend` | 项目 Agent contract、Service、Plugin 声明和选定上游实现 |
| 具体故障 | 只修复有因果依据的范围 | `ui-debugging` | 错误、当前修订验证、条件可用的 Runtime 检查 |
| 历史撤销 | 当前源码不证明历史 | `ui-change-recovery` | `inspect_creator_changes`、显式 `undo_creator_change`、事务冲突检查 |
| 模板恢复 | 原始内容须可信 | `ui-change-recovery` | `inspect_agent_ui_baseline`；当前工程无原始模板内容时返回 `baseline_missing` |

## 交付路径

- 写入 Agent 和工程只读 Agent通过同一发布包中的 Skills Backend 读取元信息、正文和直接 references。ANSWER 路径仍不暴露工具或 Skill。
- 工程上下文在模型请求层装配一份：虚拟根、实际 `sourceRoot`、权限、验证模式，以及 Host 已解析的 owner 导航。它不写入 checkpoint 历史，也不构成读过源码或获得写权限的证据。
- Skill 读取记录只在 `read_file` 工具结果实际交付时产生，区分完整与部分读取；Backend 启动扫描不计为正文交付。旧的“读过一次就永久拒绝”逻辑已移除。
- 模型调用轨迹沿用现有 `requestMessageChars`、`requestToolSchemaChars` 和供应商 usage，并新增 UTF-8 字节数。工程上下文与 Skill 交付只记录大小和内容标识，不记录正文。
- 撤销工具要求本次运行先交付目标记录，必须传明确 `run_id`；在项目写入协调器内复查全部文件 after-state，随后将实际变化计入活动回执。最新记录有冲突时查询仍显示它，不自动挑选更旧记录。

## 静态篇幅基线

| 项目 | 改造前 | 当前 |
| --- | ---: | ---: |
| `domain_agent/prompt.py` 源文件 UTF-8 字节 | 57,125 | 5,825 |
| 五份原有 Skill 正文合计 UTF-8 字节 | 69,091 | 当前六份正文合计 37,500 |

这些是仓库文件大小，不是完整模型请求大小，也不是精确 token 数。完整请求还包括 DeepAgents 注入、工具 schema、工程上下文及历史消息，需读取运行时请求轨迹和供应商 usage 才能比较。

## 当前恢复边界

支持：查询真实 Creator 事务、按记录与文件查看路径、hash 和行数摘要、对明确且未冲突的 `run_id` 执行 Host 撤销，并报告实际变化。历史源码内容不通过该工具返回。

不支持：无可信原始内容的模板恢复、任意 Git 回滚、强制覆盖全工程、自动合并用户后续编辑。模板基线查询明确返回证据缺失，不用当前模板或最新版替代。

## 待验收证据

按本次“不要验收”的要求，未运行测试、typecheck、build、发布包安装检查、浏览器检查或真实模型回归。因而运行时 Skill 可见性、不同 sourceRoot 的端到端行为、恢复冲突测试结果、完整请求前后大小和当前默认模型失败样例均未形成验收结论。提交和推送只证明代码交付。
