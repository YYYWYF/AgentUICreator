---
title: 定制品牌、样式与主题
---

# 定制品牌、样式与主题

先读取工程现有主题配置、应用层 className 和样式入口。官方主题通过共享 theme service 提供，`theme-switch` 消费同一服务，不为各 Plugin 建第二套主题状态。

只需要将启动主题改为 light、dark 或 violet 时，按[默认主题配置](./default-theme)操作。本页进一步说明品牌样式、色彩方案与组件样式的定制。

## 主题与色彩方案

公开 `/theme` 出口包含 `AgentUITheme`、`isAgentUITheme` 和 `getAgentUIThemeColorScheme`。`light` 与 `violet` 都属于 light color scheme，不能把产品预设名直接当作 CSS dark 标记。

```ts
import { isAgentUITheme, getAgentUIThemeColorScheme } from '@za38.03/agent-ui-plugins/theme';
export function colorScheme(value: unknown) {
  return isAgentUITheme(value) ? getAgentUIThemeColorScheme(value) : 'light';
}
```

## 调整外观

消息、输入框、工具卡片以及悬浮／嵌入式界面的布局、字号、间距和圆角在三种主题下保持一致，背景、文字、边框和交互状态跟随当前主题变量。切换到 light 或 dark 不会移除这些结构定制。

品牌色、尺寸、圆角和布局使用项目已有 token、CSS 或组件 props。选择器限定在项目拥有的区域，避免全局 `main`、`button`、`textarea` 影响 Host 或其他 Plugin。需要不同样式库时由项目安装和构建，不能依赖 Creator 自带库。

Shadow DOM 的 Web Component 把内部样式随资源交付；Host 控制外部元素尺寸和继承字体。修改 producer 后必须重新构建桥接资源。

## 验证

切换三种预设检查文本对比、焦点、禁用、错误、弹层与代码块。窄屏、长文本、系统字体和强 Host CSS 都要覆盖；静态构建不能替代显示验收。

> 截图待补：同一页面浅色、深色、violet 与品牌定制对照，含焦点和弹层状态。
