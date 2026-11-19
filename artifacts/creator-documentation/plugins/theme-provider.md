# 主题服务（theme-provider）

统一管理主题，并为自定义组件提供当前深浅配色。

<span id="常见需求"></span>
<span id="代码示例"></span>

## 共享主题

<figure className="plugin-preview">

![共享主题界面](/images/plugins/theme-switch.png)

<figcaption>服务联动后的界面；本插件本身没有独立界面。</figcaption>
</figure>

## 使用已有服务切换主题 \{#使用已有服务切换主题}

<span id="example-1"></span>

同一 Agent 内的按钮和主题选择框共享服务；切换后，所有订阅该主题的组件同步更新。组件声明 `agent-ui.theme` 依赖。

```tsx
import { usePluginService, useAgentUILocale } from '@za38.03/agent-ui-plugins';
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService }
  from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';

export function DarkThemeButton() {
  const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  const labels = useAgentUILocale('theme');
  return <button type="button" disabled={!service}
    onClick={() => service?.setTheme('dark')}>{labels.dark}</button>;
}
```

<span id="example-2"></span>

## 主题适配 \{#让自定义内容随主题变化}

使用项目已有语义变量；不在组件内根据语言或主题硬编码两套颜色。变量表见主题与样式指南。

```tsx
import type { ReactNode } from 'react';

export function ThemedCard({ children }: { children: ReactNode }) {
  return <section style={{
    color: 'var(--foreground)', background: 'var(--background)',
    border: '1px solid var(--border)', borderRadius: 12, padding: 16,
  }}>{children}</section>;
}
```

## 图表配色适配 \{#hook}

自定义图表需要选择深浅配色时，从 `@za38.03/agent-ui-runtime/ui` 导入 `useAgentUITheme()`，它随当前主题变化重新渲染。将主题转换为色彩模式后交给项目图表：

```tsx
import type { ReactNode } from 'react';
import { useAgentUITheme } from '@za38.03/agent-ui-runtime/ui';
import { getAgentUIThemeColorScheme, type AgentUIColorScheme }
  from '@za38.03/agent-ui-plugins';

export function ThemeAwareChart({ renderChart }: {
  renderChart: (scheme: AgentUIColorScheme) => ReactNode;
}) {
  const theme = useAgentUITheme();
  return <>{renderChart(getAgentUIThemeColorScheme(theme))}</>;
}
```

`renderChart` 接项目当前图表组件，收到 `light` 或 `dark`。普通文字、边框和背景优先使用前面示例中的语义 CSS 变量。

<span id="从业务按钮切换主题"></span>

## API

<span id="属性"></span>
<span id="开发-api"></span>

<span id="手动接入"></span>

- 设置默认主题、修改品牌色与样式：[主题与样式](/development/theme-and-styling.md)。
- 由业务页面控制主题并接收切换：[主题切换配置](/development/agent-options.md#主题切换)。
- 在自定义插件中读取主题或使用主题服务：[内置领域 Hook](/development/plugin-api.md#内置领域-hook)。

### 服务方法 \{#服务}

提供 `agent-ui.theme`。服务标识 `AGENT_UI_THEME_SERVICE` 和类型 `AgentUIThemeService` 从 `@za38.03/agent-ui-runtime/ui/services/agent-ui-theme` 导入。

| 成员                                | 用途             |
| --------------------------------- | -------------- |
| `getTheme(): AgentUITheme`        | 读取当前主题。        |
| `setTheme(theme): void`           | 切换主题。          |
| `subscribe(listener): () => void` | 订阅变化，返回取消订阅函数。 |
| `Root?`                           | 可选展示根组件。       |

应用首次装配时，`createAgentUIThemeService(initialTheme = AGENT_UI_DEFAULT_THEME)` 创建服务；普通插件消费现有实例。接收本地偏好等未知输入时，`readAgentUITheme(value: unknown): AgentUITheme` 将无效值回退到默认主题；需要提示用户输入无效而不是回退时，用 `isAgentUITheme(value)` 先判断。以上函数从 Plugins 根入口导入。

`AgentUITheme` 是可选主题的类型，`AGENT_UI_THEME_PRESETS` 可用于构造选择项；`getAgentUIThemeColorScheme(theme)` 将主题转换为 `AgentUIColorScheme`，适合需要深浅模式的图表等第三方展示。

新服务仅在应用装配时创建，其他插件消费已有服务。

<span id="可以调整什么"></span>

<span id="怎么让-creator-修改"></span>
