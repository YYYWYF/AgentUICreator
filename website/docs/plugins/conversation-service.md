---
title: "会话服务（conversation-service）"
---

# 会话服务（conversation-service）

让会话列表、会话切换和历史加载使用同一份会话信息。通常沿用项目现有配置，不需要单独修改。

## 什么时候需要关心

- 列表中有会话，但点击后没有打开对应记录。
- 删除或重命名成功后，列表没有正确更新。
- 加载失败后没有提示，或无法重试。

正常使用时，无需了解服务接口，也不需要另建一套会话管理。

## 实现与项目配置

本插件拥有会话列表、详情加载与缓存、选中会话，以及删除、重命名和归档等管理逻辑。`@za38.03/agent-ui-plugins/conversation-service` 同时提供 `ConversationDataSource`、会话数据类型及校验 Schema。

项目的 `plugins/conversation-service/definition.ts` 负责取得已配置的数据源，创建和注册服务，并在停用时清理。默认业务实现从 npm 加载；显式接管后，这个应用入口改为选择本地实现。

历史数据先由[会话数据源](./conversation-data-source)转换后端字段。本插件再处理 `<think>` 等历史消息兼容，并把会话管理适配成通用 ThreadBinding；Runtime 封装 assistant-ui 官方转换器、装载消息并管理会话运行、恢复与取消。插件不创建另一套 Agent Runtime，数据库持久化仍由业务后端负责。

## 怎么让 Creator 修改

描述具体问题和预期结果，例如：

```text
会话列表能显示历史会话，但点击后没有打开对应的聊天记录。
请检查现有历史数据源与会话服务的连接，修复切换问题，
保留页面布局、新建会话和其他会话操作。
加载失败时要有提示，并允许重试。
```

修改后，打开不同的历史会话，确认名称和消息对应正确；再检查失败提示与重试。

## 相关接口

一般不需要为此单独编写接入代码。历史接口接入见[会话数据源](./conversation-data-source)；列表定制见[会话列表](./conversation-thread-list)；业务页面主动发送消息或新建会话见[业务页面与 Agent 联动](/development/react-host-control)。

