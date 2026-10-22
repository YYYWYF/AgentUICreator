---
title: 自定义 @ 来源和应用 / 命令
---

# 自定义 @ 来源和应用 / 命令

mention-trigger 和 slash-command-trigger 是输入交互，数据和行为来自项目服务。它们与 Creator 的开发命令分别管理。

只需确认默认命令从哪里配置时，先看[应用命令来源](./command-source)。本页说明如何扩展候选、行为及其交互语义。

## 提及来源

通过现有 `conversation.mention-source` 服务提供人、资源等搜索结果。结果使用稳定 ID 与可翻译展示名；选择后保留来源身份，不把标签当作后端主键。

服务处理搜索词、异步请求、取消与缓存。清空输入或快速切词时，旧请求不能覆盖新结果。无数据与网络错误分别显示，不默认扫描本地文件或企业通讯录。

## 应用命令

`conversation.slash-command-source` 提供候选。action 由前端执行明确动作，directive 插入发送给 Agent 的结构化指令；不要因为名字一样就把两者混为一类。

命令触发器放入 composer.triggers，来源 provider 放在应用生命周期内。禁用或卸载 provider 后及时更新候选并清理订阅。

## 输入与协议

可选 Lexical 将结构化内容显示成原子 chips，普通文本入口仍应正确传递输入、composition 与键盘 props。后端若需要解析附加上下文，应遵守现有 directive 协议，不能只解析翻译后的 UI 文本。

`parseAgentUIDirectives` 与 `trySerializeAgentUIDirective` 是 Core 公开 helper。使用前核对已安装类型；把业务上下文解析放在服务端适当位置，不让展示组件猜测业务权限。

> 截图待补：异步提及搜索、无结果、取消旧请求、action 与 directive 命令各一个及芯片编辑状态。

参见 [mention-trigger](../plugins/mention-trigger) 与 [slash-command-trigger](../plugins/slash-command-trigger)。
