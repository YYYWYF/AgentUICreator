---
title: "主题服务（theme-provider）"
---

# 主题服务（theme-provider）

接入统一主题服务，为插件提供当前主题，不显示主题切换按钮。

## 手动开发

项目入口为源码目录下的 `plugins/theme-provider/index.tsx`。服务如何创建、如何调用、何时清理，继续由项目原有代码负责。

### 属性

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalThemeProviderPlugin`；类型：`ThemeProviderPluginProps`。没有独立的界面容器。

| 属性 | 类型 | 省略时 / 用途 |
| --- | --- | --- |
| `children?` | `ReactNode` | 默认不渲染内容 |

没有 `theme`、`palette` 或品牌颜色属性。主题通过已有 `Agent.theme`／主题服务接入；品牌色通过项目 CSS 覆盖。内置主题为 `light`、`dark`、`violet`，项目默认 `violet`。详见[样式与文案开发](/development/styling-and-localization)。

