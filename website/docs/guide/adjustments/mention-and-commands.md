---
title: "自定义 @ 候选与 / 命令"
---

# 自定义 @ 候选与 / 命令

本页于 2026 年 11 月 6 日使用当前 Creator 和 `deepseek-v4.1-flash`，在招行 AI 工作台中重新执行。员工搜索与纯文本草稿命令均已实际接入。

## 本次提供的资料

本轮提供了已有本地演示接口 `GET /api/employees?q=关键词`，无需鉴权，返回姓名、部门和稳定员工 ID。例如：

```json
{"items":[{"id":"employee_84721","name":"张三","department":"产品部"}]}
```

没有匹配时返回 `items: []`，关键词 `error` 模拟服务失败。发送验收使用本地官方 Mock Agent 的员工上下文场景，其引用类型约定为 `user`，按员工 ID 查演示花名册。

这些都是演示接口；接自己的业务时，需要把实际地址、鉴权、返回格式和引用类型一起交给 Creator。

## 本次怎么说

> 在当前 AI 工作台输入框增加 @ 搜索员工，候选显示姓名和部门，选择后保留稳定员工 ID，让 Agent 按 ID 获取资料。接口与返回样例已提供，保留加载、空结果、失败和重试提示。
>
> / 菜单增加短名称“查询工单”，选中后把“查询我的待处理工单”填入草稿，不自动发送，保留标准“新建会话”。英文菜单为“Query tickets”，草稿为“Query my pending tickets”。

本轮先通过 Creator 的启用入口补齐官方提及、命令触发器与命令来源的项目应用文件，再让 Creator 接入。重试中补充了实际应用文件位置，以及“填草稿应使用动作，不应插入指令引用”的公开接口信息。发送前还让 Creator 将引用类型对齐为测试 Agent 要求的 `user`。

Creator 修改现有应用层和共享双语文案，通过受控工具装配，类型检查、构建与修改校验通过。没有接管官方插件源码。

![输入功能接入后的实际修改回执。](/images/guide/examples/20261106/mention-slash-reply.jpg)

## 命令菜单与纯文本草稿

输入 `/` 后，菜单显示短名称“查询工单”，原有“新建会话”仍在：

![实际命令菜单，两个命令同时保留。](/images/guide/examples/20261106/slash-menu.jpg)

选中“查询工单”后，实际输入内容完整等于“查询我的待处理工单”，没有方括号或大括号标记，欢迎区仍在，没有自动发送：

![选中后的实际纯文本草稿。](/images/guide/examples/20261106/slash-draft.jpg)

切换英文后，也核对了短菜单名和完整英文草稿：

![英文命令填入 Query my pending tickets。](/images/guide/examples/20261106/slash-english-draft.jpg)

## 员工候选与发送

输入 `@张`，实际候选显示“张三 / 产品部”和“张晓 / 研发部”：

![本地接口返回的员工候选。](/images/guide/examples/20261106/mention-options.jpg)

选择张三后，引用保留 `user` 类型和 `employee_84721`。当前普通文本输入框会显示结构化提及标记：

![实际选择后的员工引用，稳定 ID 被保留。](/images/guide/examples/20261106/mention-selected.jpg)

从候选选择后实际发送“请查询他的部门和职务”，Mock Agent 按 ID 返回“张三是产品部的产品经理。”，消息中也显示了员工提及：

![实际发送员工引用后收到的回复。](/images/guide/examples/20261106/mention-agent-reply.jpg)

这项验证检查了演示服务的 ID 解析链路，不代表已接入真实员工系统。

## 空结果与失败

没有匹配项时，页面显示“没有匹配项”。接口返回 503 时，显示“无法加载候选项”和“重试”，没有暴露原始异常。实际点击过重试；该演示关键词持续失败，改回正常关键词后候选恢复。

![空结果提示。](/images/guide/examples/20261106/mention-empty.jpg)

![接口失败时的提示与重试入口。](/images/guide/examples/20261106/mention-error.jpg)

相关公开能力见[搜索对象](/plugins/mention-trigger)和[使用命令](/plugins/slash-command-trigger)。
