---
title: "主题与样式"
---

# 主题与样式

选择助理的主题、修改品牌色或调整组件样式时，从这里开始。定制沿用生成工程已有的 UI 库、样式方案和版本。需要 Creator 帮你修改时，见[品牌色与样式定制](/guide/adjustments/themes)。

本页导航：[选择主题](#默认主题) · [修改样式](#样式入口) · [检查效果](#验证)。修改界面文字和中英文配置见[语言与文案](./localization)。

## 默认主题

主题统一通过 `Agent` 传入。例如，固定使用深色主题：

```tsx
<Agent theme="dark" />
```

不传 `theme` 时使用内置紫色主题，启用[主题切换控件](/plugins/theme-switch)后可在界面中切换。业务页面传入 `theme` 后，由页面控制当前值；允许控件切换时，同时传入 `onThemeChange` 更新页面状态，见[主题属性与回调](./agent-options#主题切换)。

## 样式入口

在生成目录的 `styles.css` 中追加项目样式，保留原有 npm 样式导入及源码扫描声明。默认样式由 npm 提供，项目只保存自己的覆盖。

例如，在文件末尾设置 violet 主题的品牌色：

```css
:is(.agent-ui-root, .agent-ui-conversation)[data-theme="violet"] {
  --agent-brand: #1677ff;
  --agent-brand-solid: #0958d9;
  --radius: 0.75rem;
}
```

同时覆盖外框与会话根，弹层才能使用一致的主题。保持其他主题的配色；选择主题通过 `Agent` 的 `theme` 属性传入。主题 ID 使用工程支持的值，品牌颜色通过 CSS 设置。

修改具体组件时，在项目入口设置 `className`、`style` 或对应的 `…Props`；布局区域大小见[布局与插件组合](./layout-and-composition)。

从已有插件开始手动修改时，见[手动修改插件：样式与业务逻辑](./component-customization#3-插件样式定制)，其中包含文件定位、局部 CSS 和接线示例。外框、悬浮入口和面板行为见[自定义 Shell](./shell-customization)。

## 验证

运行工程的类型检查与构建，再切换浅色、深色等已有主题，检查输入、弹层、焦点和窄屏。业务页面的其他组件也应保持正常。
