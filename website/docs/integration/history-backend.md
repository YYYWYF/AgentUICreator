---
title: 接入历史会话服务
---

# 接入历史会话服务

应用接入历史 API 后，会话列表和对话区使用同一套会话导航。历史阅读和继续运行是不同能力，相关 Agent 参数见[参数与配置](./agent-options)。

## HTTP 数据源

先按[历史服务地址配置](./history-endpoint)设置 API base。以下以 `/api` 为例，说明服务需要提供的接口与加载行为。现有数据源使用 `GET /api/conversations`、`GET /api/conversations/{id}` 及相应 DELETE 路径。返回结构必须满足实际数据源合同，不能仅返回任意文本数组。

列表有稳定 ID 与展示信息，加载数据包含消息、状态和可用能力。无历史后端时使用空数据源，不承诺刷新后恢复。

## 自定义绑定

React 可通过 `ConversationThreadBinding` 提供 `getThreadId`、`subscribe`、`createNewThread`，按需实现加载、选择、删除与列表快照。完整类型见[Runtime API](./runtime-api)。

`loadThread` 加载内容，`activateThread` 同步业务选择，不能重复加载并替换已有 Runtime。删除失败保留状态；列表错误不能投影成成功的空列表。

## 运行恢复

加载结果可带 `ConversationRunResume`，其 `stream(signal)` 输出该线程的运行增量。恢复能力属于被加载线程，不是当前选择的全局事件流。

后端需要保留运行身份、状态和恢复语义。只读历史禁用不支持的发送与审批。公开 LangChain 历史投影 helper 只能转换已有数据，不能补造工具结果或后端能力。

## 验证

覆盖空列表、加载/删除失败、运行中切换、刷新恢复、取消恢复流和账号切换。核对 threadId 和请求目标，防止旧线程事件进入新会话。

> 截图待补：列表失败重试、只读历史与可恢复会话对照，附脱敏的请求身份和加载结果。
