# 界面语言切换（locale-switch）

切换中文和英文界面，支持服务绑定和业务页面控制。






## 语言选择


![语言选择界面](/images/plugins/locale-switch.png)


![切换英文后的欢迎内容、输入提示和会话列表](/images/agent-ui/appearance-english.jpg)

切换英文后，欢迎语、输入提示和“New Thread”等界面文字同步变化；历史标题和业务用户资料仍保留原内容。

## 紧凑的语言选择框 \{#紧凑的语言选择框}


沿用已有语言服务，只改控件大小。

```tsx
import type { ComponentProps } from 'react';
import { CanonicalLocaleSwitchPlugin } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalLocaleSwitchPlugin>) {
  return <CanonicalLocaleSwitchPlugin {...props}
    selectProps={{ ...props.selectProps, size: "sm" }} />;
}
```


## 受控语言选择 \{#受控语言选择}

此例展示控件受控写法；业务页面还应把选中 locale 绑定到已有 Agent 语言配置，所有插件才会同步。

```tsx
import { useState, type ComponentProps } from 'react';
import { CanonicalLocaleSwitchPlugin, type AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalLocaleSwitchPlugin>) {
  const [locale, setLocale] = useState<AgentUILocaleCode>("zh-CN");
  return <CanonicalLocaleSwitchPlugin {...props}
    locale={locale}
    onLocaleChange={setLocale} />;
}
```

## 业务入口切换语言 \{#从其他组件切换语言}

组件与服务位于同一 Agent，并声明 `agent-ui.locale` 依赖。

```tsx
import { usePluginService, type AgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService }
  from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';

export function SelectLocale({ locale, label }: { locale: AgentUILocaleCode; label: string }) {
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  return <button type="button" disabled={!service}
    onClick={() => service?.setLocale(locale)}>{label}</button>;
}
```

## API

使用 `selectProps.id` 设置选择框标识；省略时自动生成唯一 ID。



在 `CanonicalLocaleSwitchPlugin` 上设置以下属性。

继承 `section` 原生属性。

| 属性                | 类型                                                                                                                                                                | 省略时 / 用途                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `locale?`         | [`AgentUILocaleCode`](#agentuilocalecode)                                                                                                                         | 受控语言，优先于服务快照；均未提供时读取统一语言上下文                           |
| `onLocaleChange?` | [`(locale: AgentUILocaleCode) => void`](#agentuilocalecode)                                                                                                       | 受控变化回调，优先于服务的 `setLocale`                             |
| `service?`        | [`{ getSnapshot(): { locale: AgentUILocaleCode }; subscribe(listener: () => void): () => void; setLocale(locale: AgentUILocaleCode): void }`](#agentuilocalecode) | 已有语言服务                                                |
| `options?`        | `readonly AgentUILocaleCode[]`                                                                                                                                    | 限制或调整已有选项的顺序；默认全部选项                                   |
| `disabled?`       | `boolean`                                                                                                                                                         | 选择框禁用设置                                               |
| `selectProps?`    | `Omit<ComponentProps<typeof NativeSelect>, 'children' \| 'value' \| 'defaultValue' \| 'disabled'>`                                                                | 下拉框样式、标识与事件；`onChange` 先调用，`preventDefault()` 可阻止默认切换 |

没有变化回调且没有可用服务时，组件不显示。

### 语言选择怎样生效 \{#agentuilocalecode}

`locale` 接受 `zh-CN`（简体中文）或 `en-US`（英文）。业务页面控制该值时，在 `onLocaleChange(nextLocale)` 中更新它；只传一个固定 `locale` 会保持固定语言。项目默认文案和业务新增文案的配置见[语言服务](/plugins/locale-provider.md)。


其他组件需要跟随当前语言显示业务内容时，使用[语言 Hook 与双语消息示例](/plugins/locale-provider.md#example-2)。切换语言调用同一服务的 `setLocale(locale)`，对应功能示例可用于业务页面已有的语言按钮；切换后各插件继续使用原 Thread 和草稿。

### 服务方法 \{#服务}

消费 `agent-ui.locale`；服务及 `AgentUILocaleService` 类型见 [语言服务](/plugins/locale-provider.md#服务)。传入 `service` / `locale` / `onLocaleChange` 时沿用该组件公开属性约定。
