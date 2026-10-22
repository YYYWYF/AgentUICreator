---
title: 使用公开 Props、children 与 renderer 定制
---

# 使用公开 Props、children 与 renderer 定制

定位生成目录 `plugins/<id>/` 的应用入口和 definition。它们属于项目，默认 import 官方 npm 组件；修改外观、组合与回调先在这里完成。

## 保持原组合

例如 composer 应用层会把 `renderSlot('input', ...)`、triggers 和各动作传给 canonical composer。调整 DOM props 时保留这些调用，避免看似只改样式却让附件、引用或发送动作消失。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalSuggestions } from '@za38.03/agent-ui-plugins';

type Props = ComponentProps<typeof ConversationCanonicalSuggestions>;
export function ProjectSuggestions(props: Props) {
  return <ConversationCanonicalSuggestions {...props}
    rootProps={{ ...props.rootProps, className: 'project-suggestions' }} />;
}
```

这只是应用层组件片段；现有 definition 仍负责注册和上下文。若原 className 也需保留，应使用工程已有 class 合并方法。文案从项目 locale 传入。

## renderer 与 scope

reasoning、toolFallback、footer 等 renderer 需要当前消息或响应 scope。通过已有应用层桥接 props，不把组件独立挂到物理区域以伪造 scope，也不复制 Runtime Context。

数据消息和命名工具保留注册名与 toolkit/dataMessageUIs；只提供数据展示或设置的定义即使不生成独立面板也可能仍在工作。

## 何时进一步处理

先查已安装公开类型和 runtime 转发。若 wrapper 漏了上游公开参数，应修复对应应用层/公开封装，不要求用户为了缺失转发接管源码。确需实现变化时，再按[接管流程](./source-takeover)确认。

> 截图待补：应用层 props 修改前后和小范围代码差异，不出现 vendor 或共享 Runtime 改动。

检查方法见[验证定制](./test-customizations)。
