---
title: 创建和注册自定义 UI Plugin
---

# 创建和注册自定义 UI Plugin

先查看相邻 Plugin 的目录、manifest、definition、locale 和样式约定。这里只创建前端 UI 能力，不扩展成 Tool/Skill/Model/Runtime 插件体系。

开发前先阅读[插件开发能力](./development)，选择需要的状态、操作、事件、服务和渲染入口；具体字段见[插件定义参考](./plugin-contract)。复杂功能可以由多个插件通过服务与语义 Slot 协作。

## 最小项目定义

在生成目录 `plugins/project-panel/definition.tsx` 中，可以从以下无数据依赖的例子开始：

```tsx
import type { UIPluginDefinition } from '../../framework/contracts/ui-plugin';
import { parseUIPluginManifest } from '../../framework/contracts/ui-plugin';

const definition: UIPluginDefinition = {
  manifest: parseUIPluginManifest({
    id: 'project-panel', name: 'Project Panel',
    description: 'Project-owned presentation region', version: '1.0.0',
    capabilities: ['project-panel'],
  }),
  Component: () => <div data-ui-plugin="project-panel" />,
};
export default definition;
```

manifest 的说明是开发元数据。真正显示的标题、错误和无障碍标签通过项目域 locale 获取。例子不创建 Runtime、不注册 Agent 工具，也不提供后台服务。

## 注册与放置

沿用工程 Registry 生成约定发现 definition，需要时执行 Creator `/sync`。在 AppUIModel 合适物理 Slot 中添加唯一实例 `id`、准确 `pluginId` 与 `enabled`；有语义父 Slot 时检查 capability 和 cardinality。

## 服务与清理

需要共享能力时在 `services/` 定义稳定服务合同，definition 声明 provides/inject，再在 setup 生命周期注册。保存订阅的清理函数，停用、卸载和连接切换时释放。提供服务本身不会把它暴露为 Agent 工具。

读取会话通过提供的上下文或公开 bridge；避免复制 framework/runtime。renderer 必须保持正确实体 scope，没有独立界面的设置不需要额外创建面板。

> 截图待补：新 Plugin 的注册、唯一实例放置与启停效果，展示卸载后的清理结果。

合同见[Plugin API](./plugin-contract)，检查见[验证定制](../customization/test-customizations)。
