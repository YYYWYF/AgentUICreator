---
title: 应用接入与部署
description: 将生成的 Agent 前端挂载到业务页面，连接 AG-UI 与业务服务，并独立构建发布。
---

# 应用接入与部署

本章面向已有业务工程的开发者，说明如何把生成的 Agent 前端放进页面、连接业务服务并部署上线。按「页面集成 → 服务连接 → 构建与部署」完成接入后，应用可以独立运行。

尚未创建 Agent UI 时，先按[开始使用](../start/)完成初始化。Creator 的开发工具配置在[使用 Creator](../guide/)中管理，前端功能介绍见[能力概览](../agent-ui/)，布局、样式和组件实现的修改见[定制与扩展](../customization/)。

## 页面集成

先按现有工程选择一种挂载方式。Agent UI 的实现使用 React；Vue、HTML 和其他框架通过 Web Component 加载已构建的前端资源。

| 业务工程 | 接入方式 | 定制位置 |
| --- | --- | --- |
| [React](./react) | 导入生成目录的 `Agent` 组件，放入现有业务内容区。 | 当前工程中的 Agent UI 布局、Plugin 应用层和服务配置。 |
| [Vue](./vue) | 在 Vue 页面中挂载 `<agent-ui>` Web Component。 | 修改提供该组件的 React 工程，重新构建后更新 Vue 使用的资源。 |
| [HTML 或其他框架](./web-component) | 加载 Web Component 脚本或模块，在页面中挂载自定义元素。 | 同样修改提供 Web Component 的 React 工程。 |

需要核对包职责和生产依赖时，查看[依赖包与入口](./package-entries)。

挂载后，按[Agent 参数与配置](./agent-options)设置地址、语言、用户展示资料及所需适配器。如果业务按钮需要发送消息、停止运行或新建对话，按[业务页面联动](./react-host-control)接入现有会话。

## 应用配置

语言受控切换见[语言配置](./locale-configuration)，重新打开旧会话或恢复运行见[会话配置](./conversation-binding)。这些属于业务接入；修改翻译、样式或组件结构则使用[定制指南](../customization/)。

## 服务连接

界面挂载成功后，再接入它实际需要的服务：

| 服务 | 接入内容 |
| --- | --- |
| [AG-UI 服务](./connect-agent) | 配置业务 Agent 地址，检查消息、工具和运行状态能否正确更新。 |
| [认证与网络](./authentication-and-network) | 沿用业务认证、同源 API 或网关，确认跨域、凭据和流式传输。 |
| [历史会话服务](./history-backend) | 提供会话列表与历史加载；继续旧对话或恢复未完成运行还需相应后端支持。 |

附件、语音和反馈等可选能力通过[业务适配器](./attachments-dictation-feedback)接入。需要 Agent 触发已允许的页面动作时，使用[前端工具执行接入](./frontend-tools)。启用相关按钮或卡片后，仍需提供对应服务。

完整参数与类型见 [React Host API](./react-host-api)、[对话接入与适配参数](./runtime-api)和 [Web Component API](./web-component-api)；协议数据的消费边界见 [AG-UI 契约](./ag-ui-contracts)。

依赖包、完整参数与协议数据集中放在本章「依赖与接口参考」，便于实现时查阅。

## 构建与部署

完成接入后，按[构建与生产部署](./production-build)运行工程自己的检查与构建，发布静态资源和生产 API 配置。Vue/HTML 接入还需同步发布 Web Component 资源。

生产应用使用生成项目自身的前端依赖与业务服务，不需要启动 Creator 或 Mock。内网部署的依赖准备、接口可达性和资源检查也在该页说明。
