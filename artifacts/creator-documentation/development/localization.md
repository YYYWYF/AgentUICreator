# 语言与文案

本页说明如何选择界面语言、修改欢迎语和按钮文字，以及新增业务文案。需要 Creator 帮你修改时，见[语言与文案定制](/guide/adjustments/localization.md)。

本页导航：[选择语言](#选择语言) · [修改已有文案](#修改已有文案) · [读取文案](#在组件中读取文案) · [新增业务文案](#新增业务文案)。查找可覆盖的字段和默认翻译，见[文案字段参考](/development/locale-reference.md)。

## 选择语言

通过 `Agent` 的 `locale` 选择当前语言，支持 `zh-CN` 和 `en-US`。设置初始语言并允许内置切换时使用 `defaultLocale`；由业务页面控制当前语言时，同时使用 `locale` 和 `onLocaleChange`，示例见[语言切换](/development/agent-options.md#界面语言切换)。

语言配置影响界面文字；Agent 消息、用户输入和后端返回内容保留其原始语言。

## 修改已有文案

通过 `Agent` 的 `locales` 属性覆盖需要修改的文案：

```tsx
<Agent locales={{
  'zh-CN': { composer: { placeholder: '输入你的问题' } },
  'en-US': { composer: { placeholder: 'Ask your question' } },
}} />
```

`locales` 按语言、命名空间和字段覆盖文案。只提供需要修改的字段，其他字段沿用已有配置和默认翻译，两种语言的覆盖保持一致。

新生成项目的默认欢迎语和推荐问题在生成目录的 `application/locales.ts` 中维护，由 `application/project-config.tsx` 绑定。业务页面也可以通过 `Agent.locales` 覆盖；同一字段以 Host 传入的值为准，保留项目已有的其他覆盖。

### 覆盖多个功能的文案

例如，同时修改欢迎语、输入提示和历史记录标题：

```tsx
<Agent locales={{
  'zh-CN': {
    conversation: { welcome: '你好，欢迎咨询产品使用问题' },
    composer: { placeholder: '描述你遇到的问题' },
    threadList: { historyTitle: '咨询记录' },
  },
  'en-US': {
    conversation: { welcome: 'Hello! How can we help you use the product?' },
    composer: { placeholder: 'Describe your issue' },
    threadList: { historyTitle: 'Support conversations' },
  },
}} />
```

[文案字段参考](/development/locale-reference.md)中的 `toolTimeline.summary` 等字段包含占位符，覆盖时保留原有占位符名称和花括号；值由组件在运行时填入：

```tsx
<Agent locales={{
  'zh-CN': { toolTimeline: { summary: '已完成 {count} 个操作' } },
  'en-US': { toolTimeline: { summary: 'Completed {count} operations' } },
}} />
```

`conversation.welcomeDescription` 默认是空字符串，设为 `''` 可以隐藏这段可选说明。必需标签传入空字符串会回退到默认文案，不能用来隐藏按钮；按钮的显示应通过插件或组件配置调整。

## 在组件中读取文案

组件通过工程已有的统一 Hook 读取：

```tsx
import { useAgentUILocale } from '@za38.03/agent-ui-plugins';

export function ComposerHint() {
  const labels = useAgentUILocale('composer');
  return <p>{labels.placeholder}</p>;
}
```

不直接按语言写条件分支，也不复制一套独立 i18n 状态。

## 新增业务文案

官方文案沿用现有域；`Agent.locales` 不注册任意新命名空间或键。新增业务文案集中在项目共享消息模块，按领域组织完整双语表，通过统一的 `useAgentUILocaleCode()` 值选择文案。组件不写语言条件，不创建每插件国际化 Hook 或独立语言状态，纯展示函数接收文案参数。

创建共享消息模块与组件接线的完整示例，见[新增业务文案](/development/component-customization.md#新增业务文案)；Hook 和领域文案示例见[插件 API](/development/plugin-api.md#主题与多语言)。

## 验证

运行工程的类型检查与构建，再切换中英文，检查欢迎语、输入提示、按钮和屏幕阅读器标签。检查占位符替换、长文本与窄屏，确认项目和 Host 已有的覆盖仍然生效。
