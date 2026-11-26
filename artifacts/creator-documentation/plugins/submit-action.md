# 发送与停止（submit-action）

## 功能与效果


![发送与停止界面](/images/plugins/submit-action.png)

当前输入区的发送入口；运行状态由同一会话自动决定。

围绕当前 Composer 显示发送与停止入口。按钮已有运行状态和等待用户操作保护；普通应用无需自己读取组件属性来重建这些判断。

### 发送、运行与停止

草稿可提交时，发送当前正文、附件、引用和业务选择。生成中显示停止入口，当前运行结束后可发送下一条消息。

停止会取消当前运行。工具续传、审批与补充信息继续使用原有运行流程。

等待审批或补充输入时，普通发送会被已有保护拦下并提示先处理当前操作，保留草稿。传入 `disabled={false}` 不会解除会话本身的不可用条件。

## 数据来源与显示条件

### 与 Composer 联动

发送通过当前 Composer 发起 AG-UI 请求，服务端按本次请求返回[响应流](/plugins/ag-ui-data.md#共用的-sse-格式)。停止使用当前运行的取消能力。

本插件提交当前共享草稿，**不另行提供 `pluginData` 条目**。最终请求由已有 [Composer `requestAdapter`](/plugins/composer.md#请求适配) 组装；按钮没有自己的请求适配器。

发送固定本次数据快照，附件准备过程中，后续草稿修改不会覆盖它。重试、工具续答和中断恢复继续使用原次数据，最终 Composer 适配器可能再次执行，不应在适配器中附带业务写入操作。

需要业务卡片自己触发发送或停止时，使用 `useComposer().send()`／`cancel()`；前者包含等待回复保护，读取 `canSend/canCancel/disabled` 决定界面状态。完整组合见 [Composer 的发送控制](/plugins/composer.md#实时显示草稿字数定制发送与停止操作)。

## 常见定制




### 本次发送使用工作流地址 \{#本次发送使用工作流地址}

endpoint 选择同一助手当前 Thread 的请求 URL，续答沿用它；此操作不创建新会话。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationSubmitActionPlugin } from '@za38.03/agent-ui-plugins/submit-action';

export function Example(props: ComponentProps<typeof ConversationSubmitActionPlugin>) {
  return <ConversationSubmitActionPlugin {...props}
    sendButtonProps={{ ...props.sendButtonProps, endpoint: "/api/agent/research" }} />;
}
```

设置 `endpoint` 的工作流按钮为本次发送及续答选择地址，复用当前 Thread，不自动新建会话。地址是 Host 的发送路由参数，不作为按钮自己的业务数据写入 `pluginData`，也不是自动追加到 `forwardedProps` 的 URL 字段。

该分支运行期间禁用；`onSendError` 用于这一地址分支的异步发送失败。没有设置 `endpoint` 时，继续使用当前会话的普通发送流程。多个工作流按钮的组合见[同一助手使用多个地址](/development/multiple-agents.md)。

### 发送与停止使用不同样式 \{#发送与停止使用不同样式}


外层配置负责组合，两种按钮分别接受自己的原生属性。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationSubmitActionPlugin } from '@za38.03/agent-ui-plugins/submit-action';

export function Example(props: ComponentProps<typeof ConversationSubmitActionPlugin>) {
  return <ConversationSubmitActionPlugin {...props}
    sendButtonProps={{ ...props.sendButtonProps, size: "sm", variant: "default" }}
    cancelButtonProps={{ ...props.cancelButtonProps, size: "sm", variant: "outline" }} />;
}
```

## 属性与 API




### API

插件入口：`ConversationSubmitActionPlugin`。没有独立的界面容器；子按钮参数优先于整体参数。

| 属性                   | 类型                                                  | 省略时 / 用途           |
| -------------------- | --------------------------------------------------- | ------------------ |
| `className?`         | `string`                                            | 两个按钮的样式类           |
| `style?`             | `CSSProperties`                                     | 两个按钮的内联样式          |
| `disabled?`          | `boolean`                                           | 两个按钮的禁用设置          |
| `sendButtonProps?`   | `ComponentProps<typeof ConversationComposerSend>`   | 原生按钮样式、事件和 icon 属性 |
| `cancelButtonProps?` | `ComponentProps<typeof ConversationComposerCancel>` | 原生按钮样式、事件和 icon 属性 |

发送和取消是否可用由现有 Composer 决定。

#### 子按钮属性

提示按钮使用 `ConversationTooltipIconButtonProps`，继承 Base UI 按钮属性：

- 状态与事件：`disabled`、`onClick`。
- 内容与样式：`icon`、`className`、`style`。
- 组合与无障碍：`render`、`nativeButton` 和无障碍属性。

组件会叠加运行状态判断，传入 `disabled={false}` 不会解除当前会话的禁用条件。

| 属性             | 类型                                                                                           | 省略时 / 用途                               |
| -------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `variant?`     | `'default' \| 'outline' \| 'secondary' \| 'ghost' \| 'destructive' \| 'link' \| null`        | 按钮样式；各操作按钮可能预设不同值                      |
| `size?`        | `'default' \| 'xs' \| 'sm' \| 'lg' \| 'icon' \| 'icon-xs' \| 'icon-sm' \| 'icon-lg' \| null` | 按钮尺寸；各操作按钮可能预设不同值                      |
| `side?`        | `'top' \| 'bottom' \| 'left' \| 'right'`                                                     | 默认 `bottom`，提示位置                       |
| `endpoint?`    | `string`                                                                                     | 仅发送按钮；为本次发送及续答选择 URL，复用当前 Thread       |
| `onSendError?` | `(error: Error) => void`                                                                     | 仅设置 `endpoint` 时使用的发送失败回调；按钮仍显示本地化失败提示 |

提示按钮默认 `variant="ghost"`、`size="icon"`；普通 `Button` 默认均为 `default`，本插件的预设值以上文为准。普通 `Button` 不包含 `tooltip`、`side`。

发送、停止和取消文案统一在 `locales.composer` 修改：`send`、`stop`、`cancelSend`。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。


