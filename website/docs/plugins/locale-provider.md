---
title: "语言服务（locale-provider）"
---

# 语言服务（locale-provider）

## 功能与效果

共享界面语言和文案，支持官方字段覆盖与业务双语内容。

### 语言与文案

<figure className="plugin-preview">

![语言与文案界面](/images/plugins/locale-switch.png)

<figcaption>服务联动后的界面；本插件本身没有独立界面。</figcaption>
</figure>

## 修改与启用

<span id="手动接入"></span>

- 设置语言、覆盖已有文案及新增业务文案：[语言与文案](/development/localization)。
- 由业务页面管理当前语言并接收切换：[界面语言切换配置](/development/agent-options#界面语言切换)。
- 查找可覆盖的字段及中英文默认值：[文案字段参考](/development/locale-reference)。

## 常见定制

<span id="常见需求"></span>

<span id="代码示例"></span>

### 覆盖输入框提示 {#覆盖输入框提示}

<span id="example-1"></span>


把 messages 合并到项目已有 Agent.locales 配置，保留其他语言域。它只覆盖已有官方键，不注册任意新键。

```tsx fold height=180
import type { AgentUILocaleOverrides } from '@za38.03/agent-ui-plugins';

export const messages = {
  'zh-CN': { composer: { placeholder: '请输入你的业务问题' } },
  'en-US': { composer: { placeholder: 'Ask a business question' } },
} satisfies Record<'zh-CN' | 'en-US', AgentUILocaleOverrides>;
```

<span id="example-2"></span>

### 新增业务领域文案 {#新增业务领域文案}

共享消息模块中维护双语字段，组件读取统一 locale。不要新增独立语言状态或每插件语言 Hook。

```tsx fold height=180
import { useLocaleCode } from '@za38.03/agent-ui-plugins';

const reportMessages = {
  'zh-CN': { title: '业务报告' },
  'en-US': { title: 'Business report' },
};
export function ReportTitle() {
  const locale = useLocaleCode();
  return <h2>{reportMessages[locale].title}</h2>;
}
```

### 业务入口切换语言 {#从业务按钮切换语言}

组件与服务位于同一 Agent，并声明 `agent-ui.locale` 依赖。

```tsx fold height=180
import { usePluginService, type AgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService }
  from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';

export function SelectLocale({ locale, label }: { locale: AgentUILocaleCode; label: string }) {
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  return <button type="button" disabled={!service}
    onClick={() => service?.setLocale(locale)}>{label}</button>;
}
```

## 属性与 API

<span id="属性"></span>

<span id="开发-api"></span>

### API



<span id="hook"></span>

从 `@za38.03/agent-ui-plugins` 导入语言 Hook，组件复用统一上下文：

| Hook | 用途 |
| --- | --- |
| `useLocaleCode(): AgentUILocaleCode` | 读取当前语言。 |
| `useLocale()` | 返回全部文案。 |
| `useLocale(namespace)` | 返回指定领域的文案。 |
| `/plugin-support` 的 `useLocaleSnapshot(service)` | 订阅显式传入的服务；服务缺失时沿用当前 locale。 |

#### 服务方法 {#服务}

提供 `agent-ui.locale`。服务标识 `AGENT_UI_LOCALE_SERVICE`、类型 `AgentUILocaleService` / `AgentUILocaleSnapshot` 从 `@za38.03/agent-ui-runtime/ui/services/agent-ui-locale` 导入。

| 方法 | 用途 |
| --- | --- |
| `getSnapshot()` | 读取 `{ locale, direction }`。 |
| `subscribe(listener)` | 订阅变化，返回取消订阅函数。 |
| `setLocale(locale)` | 切换语言。 |
| `getMessages?()` | 读取当前文案；契约中为可选方法。 |
| `setMessages?(messages)` | 替换按语言组织的覆盖集合；保留无关覆盖时先合并。 |

官方 `createAgentUILocaleService(initialLocale = 'zh-CN', initialMessages = {})` 实现上述所有方法，从根入口或 `/locale-provider` 导入。

组合多个模块的官方文案覆盖时，从 Plugins 根入口使用 `mergeAgentUILocaleOverrides(base, overrides): AgentUILocaleOverrides`。它逐领域合并，后值覆盖同名字段，保留同一领域的其他字段。需要在 React 以外取得完整文案时，调用 `resolveAgentUILocaleMessages(locale, overrides): AgentUILocaleMessages`，按指定语言补齐默认值；组件内仍使用前面的 Hook。


<span id="可以调整什么"></span>

<span id="怎么让-creator-修改"></span>
