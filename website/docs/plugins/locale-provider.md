---
title: "语言服务（locale-provider）"
---

# 语言服务（locale-provider）

接入统一语言服务，为插件提供当前语言和文案，不显示语言切换按钮。

## 手动开发

项目入口为源码目录下的 `plugins/locale-provider/index.tsx`。服务如何创建、如何调用、何时清理，继续由项目原有代码负责。

### 属性

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalLocaleProviderPlugin`；类型：`LocaleProviderPluginProps`。没有独立的界面容器。

| 属性 | 类型 | 省略时 / 用途 |
| --- | --- | --- |
| `children?` | `ReactNode` | 默认不渲染内容 |
| `renderSlot?` | `(name: string, fallback?: ReactNode) => ReactNode` | 按插槽名称显示子插件；当前组件未调用此函数 |

组件自身没有 `locale`／`locales` 属性。语言选择与覆盖通过项目 `Agent` 的 `locale`、`defaultLocale`、`onLocaleChange`、`locales` 接入；见[Agent 属性表](/development/react-host-api)。生成项目默认使用 `zh-CN`；单独使用展示组件、未提供语言设置时，默认使用 `en-US`。

