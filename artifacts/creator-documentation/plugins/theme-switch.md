# 主题切换（theme-switch）

## 功能与效果

在浅色、深色和紫色主题间切换，支持服务绑定和受控选择。


### 主题选择


![主题选择界面](/images/plugins/theme-switch.png)


![浅色主题下的聊天记录与会话列表](/images/agent-ui/history-conversation.jpg)

浅色主题：消息区和右侧列表使用浅色背景。


![深色主题下的同一段聊天记录与会话列表](/images/agent-ui/appearance-dark.jpg)

深色主题：同一段对话的背景、文字、输入区和列表一起适配。

## 常见定制





### 紧凑的主题选择框 \{#紧凑的主题选择框}


selectProps.size 是组件尺寸 sm/default，不是原生 select 展示行数。

```tsx
import type { ComponentProps } from 'react';
import { CanonicalThemeSwitchPlugin } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalThemeSwitchPlugin>) {
  return <CanonicalThemeSwitchPlugin {...props}
    selectProps={{ ...props.selectProps, size: "sm" }} />;
}
```


### 受控主题选择 \{#受控主题选择}

使用受控属性时，业务页面负责保存并应用主题。只改变选择框状态不会自动替你更新外层 Agent 的主题。

```tsx
import { useState, type ComponentProps } from 'react';
import { CanonicalThemeSwitchPlugin, type AgentUITheme } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalThemeSwitchPlugin>) {
  const [theme, setTheme] = useState<AgentUITheme>("violet");
  return <CanonicalThemeSwitchPlugin {...props}
    theme={theme}
    onThemeChange={setTheme} />;
}
```

### 业务入口切换主题 \{#从其他组件切换主题}

组件与服务位于同一 Agent，并声明 `agent-ui.theme` 依赖。

```tsx
import { usePluginService, useLocale } from '@za38.03/agent-ui-plugins';
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService }
  from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';

export function SelectDarkTheme() {
  const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  const labels = useLocale('theme');
  return <button type="button" disabled={!service}
    onClick={() => service?.setTheme('dark')}>{labels.dark}</button>;
}
```

## 属性与 API



### API

使用 `selectProps.id` 设置选择框标识；省略时自动生成唯一 ID。

在 `CanonicalThemeSwitchPlugin` 上设置以下属性。

继承 `section` 原生属性。

| 属性               | 类型                                                                                                                                | 省略时 / 用途                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `theme?`         | [`AgentUITheme`](#agentuitheme)                                                                                                   | 受控主题，优先于服务快照；均未提供时回退 `violet`                                                        |
| `onThemeChange?` | [`(theme: AgentUITheme) => void`](#agentuitheme)                                                                                  | 受控变化回调，优先于服务的 `setTheme`                                                             |
| `service?`       | [`{ getTheme(): AgentUITheme; setTheme(theme: AgentUITheme): void; subscribe(listener: () => void): () => void }`](#agentuitheme) | 已有主题服务                                                                               |
| `options?`       | `readonly AgentUITheme[]`                                                                                                         | 限制或调整已有选项的顺序；默认全部选项                                                                  |
| `disabled?`      | `boolean`                                                                                                                         | 选择框禁用设置                                                                              |
| `selectProps?`   | `Omit<ComponentProps<typeof NativeSelect>, 'children' \| 'value' \| 'defaultValue' \| 'disabled'>`                                | 下拉框样式、标识与事件；`size` 为 `'sm' \| 'default'`；其 `onChange` 先调用，`preventDefault()` 可阻止默认切换 |

没有变化回调且没有可用服务时，组件不显示。

#### 选择值与页面控制 \{#agentuitheme}

`theme` 接受 `light`（浅色）、`dark`（深色）、`violet`（紫色，使用浅色配色模式）。传入 `theme` 后，业务页面在 `onThemeChange(nextTheme)` 中更新该值，用户选择才会反映到受控界面；[受控切换示例](#代码示例)展示了这条数据流。


其他组件要读取当前主题，从 Runtime `/ui` 导入 `useTheme()`；需要主动切换主题时，调用同一主题服务的 `setTheme(theme)`。示例把现有 Agent 切为深色；项目默认主题、系统跟随和偏好保存见[主题服务](/plugins/theme-provider.md)。

#### 服务方法 \{#服务}

消费 `agent-ui.theme`；服务契约与类型见 [主题服务](/plugins/theme-provider.md#服务)。
