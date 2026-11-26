# 语音输入（开发中）

## 功能与效果


![语音输入界面](/images/plugins/dictation-action.png)

输入区中的语音入口；支持的环境下可开始听写，录音时切换为停止听写。

在已有语音能力可用时，开始听写并将识别结果写入当前草稿；录音期间显示停止听写入口。默认使用受支持的浏览器语音识别，需要麦克风权限和可用设备。业务转写服务接入仍在开发中，见[语音转写服务](/development/speech-to-text.md)。

### 开始与停止听写

按钮根据当前能力与录音状态切换，不需要用户自己配置两个按钮的显示条件。停止听写只结束语音录入；用户仍可以编辑文字，再通过原有发送入口提交。

实际入口是否显示取决于当前 Runtime 的听写能力。样式配置不启用浏览器不支持的识别服务，也不替代麦克风授权。

## 数据来源与显示条件

### 与 Composer 联动

识别结果写入同一份草稿正文，`useComposer()` 的 `text` 会随之更新。录音期间的输入禁用状态也参与控制器的 `disabled`，自定义输入和发送入口应读取同一状态，见 [Composer 的草稿订阅与控制](/plugins/composer.md#hook)。

该插件不产生额外 `pluginData`，不会自动把录音作为音频附件发送。正常发送时，识别文字按照普通用户正文进入 `request.messages`；后端若需要原始音频，应另行使用支持音频的附件流程。

例如识别后的草稿为“请查询订单进度”，用户点击发送后，请求中的用户消息为（仅列相关字段）：

```json ag-ui
{
  "messages": [
    {
      "id": "user-1",
      "role": "user",
      "content": "请查询订单进度"
    }
  ]
}
```

“停止听写”与“停止 Agent 回答”是不同操作：前者停止录音，后者属于[发送／停止插件](/plugins/submit-action.md)。停止听写本身不会发送 Agent 请求。

## 常见定制





### 开始和停止使用不同样式 \{#开始和停止使用不同样式}


两种状态的按钮分别配置；示例不提供语音转写服务，现有开发状态不变。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationDictationActionPlugin } from '@za38.03/agent-ui-plugins/dictation-action';

export function Example(props: ComponentProps<typeof ConversationDictationActionPlugin>) {
  return <ConversationDictationActionPlugin {...props}
    startButtonProps={{ ...props.startButtonProps, size: "sm", variant: "ghost" }}
    stopButtonProps={{ ...props.stopButtonProps, size: "sm", variant: "outline" }} />;
}
```


### 禁用语音输入 \{#禁用语音入口}

业务未提供转写适配时，可按项目状态禁用入口。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationComposerDictate } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationComposerDictate>) {
  return <ConversationComposerDictate {...props}
    disabled={true} />;
}
```

## 属性与 API



### API

插件入口：`ConversationDictationActionPlugin`。没有独立根节点；整体外观参数同时传给开始和停止按钮，子按钮参数可覆盖它们。

| 属性                  | 类型                                                         | 省略时 / 用途  |
| ------------------- | ---------------------------------------------------------- | --------- |
| `className?`        | `string`                                                   | 两个按钮的样式类  |
| `style?`            | `CSSProperties`                                            | 两个按钮的内联样式 |
| `disabled?`         | `boolean`                                                  | 两个按钮的禁用设置 |
| `startButtonProps?` | `ComponentProps<typeof ConversationComposerDictate>`       | 开始听写按钮属性  |
| `stopButtonProps?`  | `ComponentProps<typeof ConversationComposerStopDictation>` | 停止听写按钮属性  |

两个子按钮保留原生样式、事件和 icon 属性，根据现有听写能力和录音状态切换可见性。

#### 子按钮属性

提示按钮使用 `ConversationTooltipIconButtonProps`，继承 Base UI 按钮属性：

- 状态与事件：`disabled`、`onClick`。
- 内容与样式：`icon`、`className`、`style`。
- 组合与无障碍：`render`、`nativeButton` 和无障碍属性。

组件会叠加运行状态判断，传入 `disabled={false}` 不会解除当前会话的禁用条件。

| 属性         | 类型                                                                                           | 省略时 / 用途          |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------- |
| `variant?` | `'default' \| 'outline' \| 'secondary' \| 'ghost' \| 'destructive' \| 'link' \| null`        | 按钮样式；各操作按钮可能预设不同值 |
| `size?`    | `'default' \| 'xs' \| 'sm' \| 'lg' \| 'icon' \| 'icon-xs' \| 'icon-sm' \| 'icon-lg' \| null` | 按钮尺寸；各操作按钮可能预设不同值 |
| `side?`    | `'top' \| 'bottom' \| 'left' \| 'right'`                                                     | 默认 `bottom`，提示位置  |

提示按钮默认 `variant="ghost"`、`size="icon"`；普通 `Button` 默认均为 `default`，本插件的预设值以上文为准。普通 `Button` 不包含 `tooltip`、`side`。

语音按钮提示及无障碍名称统一在 `locales.composer` 修改：`voiceInput`、`startVoice`、`stopDictation`、`stopVoice`。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。



