---
title: "主题服务（theme-provider）"
---

# 主题服务（theme-provider）

统一管理助理界面的主题。内置浅色、深色和紫色，默认使用紫色主题。

## 可以调整什么

| 你关心的内容 | 告诉 Creator 什么 |
| --- | --- |
| 默认主题 | 首次打开使用浅色、深色还是紫色。 |
| 切换入口 | 是否允许用户切换，以及入口放在哪里。 |
| 品牌外观 | 品牌色、圆角、字号等具体要求。 |
| 与业务页面同步 | 是否跟随页面或系统主题、是否需要记住选择。 |

## 怎么让 Creator 修改

在 Creator 输入框描述预期效果，例如：

```text
助理首次打开使用深色主题，同时保留主题切换入口。
品牌色改为 #1677ff，输入框圆角设为 12px。
保留当前布局和按钮功能，不影响业务页面的其他组件。
请检查浅色、深色主题下的文字与背景是否清楚。
```

修改后，切换主题检查文字、按钮和弹层，确认会话和草稿保留。跟随系统主题、刷新后记住选择需要另行接入，请明确提出。

实际操作记录见[品牌色与样式定制](/guide/adjustments/themes)。

## 手动接入

不传 `theme` 时，默认紫色，并允许已启用的主题控件自行切换。固定深色时可传 `<Agent theme="dark" />`。

希望初始深色且允许用户切换时，由业务页面保存当前值并接收变化：

```tsx
import { useState } from 'react';
import type { AgentUITheme } from '@za38.03/agent-ui-plugins';
import { Agent } from './agent-ui';

export function App() {
  const [theme, setTheme] = useState<AgentUITheme>('dark');
  return <Agent theme={theme} onThemeChange={setTheme} />;
}
```

以上导入假设代码位于 `src/App.tsx`、生成目录为 `src/agent-ui/`。只传固定 `theme` 而不更新它，界面会保持指定主题。内置值为 `light`、`dark`、`violet`。

品牌色等修改放在生成目录的 `styles.css`，沿用项目已有样式方案。具体示例见[样式与文案开发](/development/styling-and-localization)。

