---
title: "样式与文案开发"
---

# 样式与文案开发

样式和文案在项目中定制，沿用工程已有的 UI 库、样式方案和版本。需要 Creator 帮你修改时，见[主题与样式需求](/guide/adjustments/themes)和[语言与文案需求](/guide/adjustments/localization)。

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

修改具体组件优先使用其公开 `className`、`style` 或对应的 `…Props`。避免依赖上游私有 DOM 和类名；布局区域大小见[布局与插件组合](./layout-and-composition)。

## 修改已有文案

通过 `Agent` 的 `locales` 属性覆盖需要修改的文案：

```tsx
<Agent locales={{
  'zh-CN': { composer: { placeholder: '输入你的问题' } },
  'en-US': { composer: { placeholder: 'Ask your question' } },
}} />
```

默认翻译由 npm 提供，两种语言的覆盖保持一致。

组件通过工程已有的统一 Hook 读取：

```tsx
import { useAgentUILocale } from '@za38.03/agent-ui-plugins';

export function ComposerHint() {
  const labels = useAgentUILocale('composer');
  return <p>{labels.placeholder}</p>;
}
```

不直接按语言写条件分支，也不复制一套独立 i18n 状态。

官方文案沿用现有域；`Agent.locales` 不注册任意新命名空间或键。新增业务文案集中在项目共享消息模块，按领域组织完整双语表，通过统一的 `useAgentUILocaleCode()` 值选择文案。组件不写语言条件，不创建每插件国际化 Hook 或独立语言状态，纯展示函数接收文案参数。示例见[插件 API](./plugin-api#主题与多语言)。

## 验证

运行工程的类型检查与构建，再切换中英文及浅色、深色等已有主题，检查输入、弹层、焦点、长文本和窄屏。业务页面的其他组件也应保持正常。
