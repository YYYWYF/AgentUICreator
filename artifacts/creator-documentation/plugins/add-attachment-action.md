# 附件添加（add-attachment-action）


![附件选择界面](/images/plugins/add-attachment-action.jpg)

文件已加入草稿，输入区显示附件与移除入口；继续填写问题后一起发送。

通过现有附件能力把文件加入当前草稿。选择后由 Composer 显示附件项、移除入口与准备状态；配置上传服务时在发送阶段上传，用户无需自己把按钮、上传和消息正文串起来。

## 选择、移除并随消息发送

按钮打开文件选择器，接受类型取自当前附件适配器；可多选时一次加入多个文件。草稿中的附件可以在发送前移除，正文仍可继续编辑。

生成项目默认使用本地 Base64 附件适配器，单文件上限 20 MiB；这不等于已接入业务文件服务。需要地址型附件时，按[附件上传服务](/development/attachment-upload.md)接入现有 Host。上传、认证与失败处理配置属于附件服务，不是本按钮的外观属性。

## 与 Composer 联动

附件进入原生 `composer.attachments`，**不另建 `pluginData[附件插件ID]` 条目**。发送时由当前 AG-UI 适配器把它转换到用户消息的 `content` 数组，和正文一起进入最终 `request`。

例如输入“请总结附件中的内容”，并通过上传服务得到 PDF 地址，用户消息可以是：

```json ag-ui
{
  "id": "user-1",
  "role": "user",
  "content": [
    { "type": "text", "text": "请总结附件中的内容" },
    {
      "type": "document",
      "source": { "type": "url", "value": "https://files.example.com/order.pdf", "mimeType": "application/pdf" },
      "metadata": { "filename": "order.pdf" }
    }
  ]
}
```

这是 `request.messages` 中的一条消息示例，不是整个请求。当前适配器将 PDF 等普通文件转换为 `document`，图片、音频和视频分别使用 `image/audio/video`，不要自行把 PDF 固定拼成 `type: 'file'`。

本地内嵌数据使用 `source.type: 'data'`，`value` 为不带 `data:...;base64,` 前缀的 Base64，并带 `mimeType`，例如图片片段：

```json ag-ui
{
  "type": "image",
  "source": { "type": "data", "value": "aGVsbG8=", "mimeType": "image/png" },
  "metadata": { "filename": "diagram.png" }
}
```

这里的 Base64 只是格式占位，实际值由附件适配器生成。最终 [Composer `requestAdapter`](/plugins/composer.md#请求适配)接收到的 `request.messages` 已包含转换后的附件；只改业务字段时保留这些内容，避免把整个消息替换为纯文本而丢失文件。

## 其他插件添加或移除附件

业务文件按钮使用 `useComposer().addAttachment(file)`，传入浏览器 `File`，不要把 `File` 塞进 `setData()`。用 `useComposer(state => state.attachments)` 订阅的附件列表提供 `{ id, name }`，`removeAttachment(id)` 按 ID 移除；这份展示列表不是完整的媒体请求格式或上传状态。完整示例见 [Composer 的控制器](/plugins/composer.md#响应式草稿控制器)。

添加与移除返回 Promise，调用方处理失败。提交前移除的文件不进入本次消息；已接受提交的附件快照不受下一条草稿修改影响。

## 文件单选 \{#单文件选择}


multiple 控制文件选择器一次能选择多少文件；不限制整个草稿累计添加的附件数量，也不负责上传。

```tsx
import type { ComponentProps } from 'react';
import { ConversationComposerAddAttachment } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationComposerAddAttachment>) {
  return <ConversationComposerAddAttachment {...props}
    multiple={false} />;
}
```


## 按钮外观 \{#小号描边按钮}

size 和 variant 直接传给按钮，side 控制提示出现的位置。已有上传适配继续使用。

```tsx
import type { ComponentProps } from 'react';
import { ConversationComposerAddAttachment } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationComposerAddAttachment>) {
  return <ConversationComposerAddAttachment {...props}
    size="sm"
    variant="outline"
    side="top" />;
}
```

## API



在 `ConversationComposerAddAttachment` 上设置以下属性。

保留提示按钮的原生样式、事件与 icon 属性；默认提示从 locales 读取。

| 属性          | 类型          | 省略时 / 用途                     |
| ----------- | ----------- | ---------------------------- |
| `icon?`     | `ReactNode` | 自定义操作图标；文案使用统一 locale        |
| `multiple?` | `boolean`   | 文件选择器是否允许多选；省略时使用现有附件组件的默认设置 |

默认提示方向为 `bottom`，按钮为 `ghost`／`icon`。上传地址和上传方法继续使用项目已有的附件服务配置。

### 按钮属性

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

默认提示与无障碍文案只读取 `locales.composer.addAttachment`。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。


multiple=
&#x20;能限制整个会话只能上传一个文件吗？

不能。它只限制一次文件选择。累计数量、类型、大小和实际上传由项目附件适配实现。






