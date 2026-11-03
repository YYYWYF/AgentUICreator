---
title: "开发文档"
description: 自己编写 Agent 前端时，查找工程入口、接入指南、组件属性、方法与事件。
---

# 开发文档

**需要自己编写业务联动、自定义组件或插件时，从这里开始。**你可以直接修改生成工程，也可以与 Creator 配合开发；应用的运行和部署不需要启动 Creator。

如果只是调整文案、主题、布局或启停功能，先到[使用 Creator](/guide/)描述需求即可，无需先阅读本章。复杂需求同样可以交给 Creator 分析和实现。

## 按要做的事查找

| 我想做什么 | 从这里开始 |
| --- | --- |
| 找到要修改的文件 | [工程结构与修改入口](./project-structure) |
| 把助理放进已有页面 | [React](./react)、[Vue](./vue)、[HTML 与其他框架](./web-component) |
| 设置地址、主题、语言或打开已有会话 | [Agent 配置示例](./agent-options)、[完整属性表](./react-host-api) |
| 让业务按钮发送消息、停止运行或新建会话 | [业务页面联动](./react-host-control)、[会话方法](./react-host-api#会话方法) |
| 接收 Agent 通知、读取运行状态 | [状态与事件](./react-host-api#状态与事件)、[业务事件](./react-host-api#订阅-agent-业务事件) |
| 修改某个插件的属性、样式或组件组合 | [组件定制](./component-customization)、[插件](/plugins/) |
| 改变区域大小、位置与插件顺序 | [布局与插件组合](./layout-and-composition) |
| 自己展示工具结果或图表 | [自定义结果展示](./custom-renderers) |
| 将自定义 AG-UI 事件显示为消息卡片 | [自定义事件与消息渲染](./custom-ag-ui-events) |
| 接入上传、语音或评价接口 | [业务服务接入](./attachments-dictation-feedback) |
| 让 Agent 调用页面已有方法 | [前端工具接入](./frontend-tools) |
| 新增一个可独立启停的界面功能 | [创建自定义插件](./create-plugin)、[插件接口](./plugin-api) |

## 常用 API

- [Agent 与 Provider 属性、会话方法、Hooks 和事件](./react-host-api)
- [Web Component 配置与事件](./web-component-api)
- [插件公共能力、接口与使用示例](./plugin-api#公共能力速查)

先使用项目组件入口中的公开属性、组合和渲染接口。需要维护官方组件内部实现时，再了解[源码接管](./source-takeover)及后续更新方式。
