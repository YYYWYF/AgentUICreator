# Agent 名称与头像（agent-identity）


![名称与头像界面](/images/plugins/agent-identity.png)

名称、Logo 和说明组成一个身份区域；这里只改变展示标识，不改变当前助手或 Thread 的归属。

在界面中展示助手名称、Logo 和可选说明，并跟随统一的界面语言选择名称。

## 展示助手名称与 Logo

配置名称和 Logo 后，插件以统一的身份区域展示；没有 Logo 时使用默认机器人图标，没有名称或当前语言缺少对应名称时使用统一文案中的默认名称。

可选说明出现在名称下方。该区域属于展示标识，不会仅因修改名称或图片就创建、切换或重新连接一个助手。

## 名称跟随界面语言

名称可以提供中英文版本，界面语言切换后自动选择对应版本，无需为插件维护另一套语言状态。只传字符串时，各种语言使用相同名称。

默认无障碍名称和悬浮标题也跟随当前展示名称；缺少某种语言的配置时仍有默认名称可用。

## 标识与真实助手身份

插件显示的名称、Logo 和描述是界面内容。业务代码要识别当前逻辑助手时，应读取现有助手身份，而不是将显示名称当作稳定 ID；修改展示不会改变 Thread 的归属。

## 为名称提供双语版本 \{#按界面语言显示名称}


在已有身份插件入口配置名称，语言选择继续沿用统一语言环境：

```tsx
import type { ComponentProps } from 'react';
import { AgentIdentityPlugin as Implementation } from '@za38.03/agent-ui-plugins/agent-identity';

export function AgentIdentityPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    name={{ 'zh-CN': '业务助手', 'en-US': 'Business assistant' }} />;
}
```

## 调整 Logo 和名称样式 \{#logo-尺寸与名称样式}


项目已配置 Logo 时，可以改变图片尺寸和名称排版，继续使用默认内容与语言选择：

```tsx
import type { ComponentProps } from 'react';
import { AgentIdentityPlugin as Implementation } from '@za38.03/agent-ui-plugins/agent-identity';

export function AgentIdentityPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    logoProps={{ ...props.logoProps, width: 32, height: 32 }}
    styles={{ ...props.styles, name: { ...props.styles?.name, fontWeight: 600 } }} />;
}
```

## API

以下选项调整身份区域的展示。名称的语言选择、默认名称和缺少 Logo 时的图标由插件处理。



继承 `div` 原生属性，排除 `children` 和原生 `title`；名称与 Logo 使用专用属性。

| 属性             | 类型                                                        | 省略时 / 用途                              |
| -------------- | --------------------------------------------------------- | ------------------------------------- |
| `name?`        | `string \| Partial<Record<'en-US' \| 'zh-CN', string>>`   | 名称；省略或当前语言未配置时使用 `agentIdentity.name` |
| `logo?`        | `string`                                                  | Logo URL；没有时展示默认机器人图标                 |
| `description?` | `string`                                                  | 可选描述                                  |
| `logoProps?`   | `Omit<ComponentProps<'img'>, 'src' \| 'children'>`        | Logo 图片原生属性，仅在有 `logo` 时使用            |
| `classNames?`  | `Partial<Record<'name' \| 'description', string>>`        | 名称与描述样式类                              |
| `styles?`      | `Partial<Record<'name' \| 'description', CSSProperties>>` | 名称与描述内联样式                             |







### 读取当前助手标识 \{#hook}

从 `@za38.03/agent-ui-runtime/plugin-api` 导入 `useAgentUIAgentIdentity()`，可取得当前 Host 的 `{ agentId: string }`；没有身份上下文时返回 `undefined`。它不返回界面上的名称、Logo 或说明；这些展示内容通过本页的组件属性设置。

例如，同一个业务组件分别放在两个助手里，需要把点击关联到各自的助手时：

```tsx
import { useAgentUIAgentIdentity } from '@za38.03/agent-ui-runtime/plugin-api';

export function OpenAgentDetails({ label, onOpen }: {
  label: string;
  onOpen: (agentId: string) => void;
}) {
  const identity = useAgentUIAgentIdentity();
  return <button type="button" disabled={!identity}
    onClick={() => { if (identity) onOpen(identity.agentId); }}>{label}</button>;
}
```

把组件放入已有 Agent 的插件中，`label` 来自项目文案，`onOpen` 接业务详情入口。点击只传出当前 `agentId`，不切换助手或新建 Thread。Host 的身份配置见[多个助理](/development/multiple-agents.md)。
