# @ 提及搜索（mention-trigger）

## 功能与效果


![提及候选界面](/images/plugins/mention-trigger.png)

输入 @ 查询后显示候选；选中对象会插入当前草稿。

在草稿中输入 `@` 后搜索项目提供的人、文件或资料，选中后插入引用。插件已处理搜索弹层、键盘选择、请求取消和引用插入；用户选好对象后继续编辑，再通过 Composer 发送。

### 搜索并选择一个对象

候选来自项目的 `source.search({ query, signal })`，不是插件内置的业务通讯录。输入查询时按防抖设置取数，过期查询通过 `signal` 取消；选中后保留查询前后的文字，只替换当前 `@` 查询片段。

默认格式保留稳定 ID 和展示名，例如选择小李后写入 `:user[小李]{name=u-1}`。配置了 [Lexical 输入](/plugins/lexical-composer-input.md#与-composer-联动)时显示为可整体选择、删除的标签；标签样式不改变实际发送的引用文本。


![Lexical 输入框中的提及标签和命令标签](/images/plugins/lexical-composer-input.png)

图中选中的是“产品说明文档”：@ 提及和 / 指令都显示为紫色标签，前后仍可输入普通文字。标签对应正文中的引用标记。

项目如何提供 HTTP 搜索、处理错误与缓存见[接入提及数据源](/development/composer-sources.md)。未提供可用来源时，不会自动出现业务候选。

## 数据来源与显示条件

### 交给 Composer 的数据



以下候选中的 `data` 由项目定义，必须可序列化为 JSON：

```json ag-ui
{ "id": "u-1", "type": "user", "label": "小李", "data": { "employeeId": "E1001" } }
```

选择该候选后，正文包含 `:user[小李]{name=u-1}`，`data` 不编码进标记。假设触发器实例 ID 为 `employee-mention`，最终 Composer 适配器可读取：

```json ag-ui
{
  "pluginData": {
    "employee-mention": [
      {
        "id": "u-1",
        "type": "user",
        "label": "小李",
        "data": {
          "employeeId": "E1001"
        }
      }
    ]
  }
}
```

`pluginData[实例ID]` 是**候选数组**，包括实际提供的可选字段。连续选中多个引用会保留多项；删除某个引用后，那一项不再进入本次请求。未选中、仅输入 `@` 查询文字不会生成选择数据。

**默认发送正文引用，不自动新增 `forwardedProps` 中的选中项字段。** 后端若需要员工 ID 或完整对象，在已有 [Composer `requestAdapter`](/plugins/composer.md#请求适配) 中读取上述实例键并组装。触发器本身没有单独的 `requestAdapter`。

例如选中小李后输入“请查看他的待办”，默认请求中的用户消息为（仅列相关字段）：

```json ag-ui
{
  "messages": [
    {
      "id": "user-1",
      "role": "user",
      "content": ":user[小李]{name=u-1} 请查看他的待办"
    }
  ]
}
```

嵌在其他业务插件中的提及入口使用该实例的 `:mention` 子键；以实际组合的实例 ID 为准。手动填入相同标记能恢复文字或标签展示，不能凭标记还原没有保存的原始 `data`。

## 常见定制




### 改变插入文字与移除规则

`onSelect(item, { text, range })` 返回**替换当前查询的片段**。例如返回 `item.label` 就插入纯名称，插件仍保留其对应原始选择；返回 `null` 移除当前查询，不记录选择。不要把前后整段草稿再次拼回返回值，插件已经负责保留它们。

修改正文格式不会自动把原始数据发给后端，仍由最终 Composer 适配器决定。已接受提交后清理本次待发送选择；重试和续答使用原次快照，不读取下一条草稿的新选择。更完整的提交规则见 [Composer](/plugins/composer.md#提交后的快照重发与会话切换)。

### 设置搜索防抖 \{#设置搜索防抖}


用户停止输入 300ms 后执行候选搜索。实际查询仍由项目提供的 source 完成。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { CanonicalConversationMentionTrigger } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalConversationMentionTrigger>) {
  return <CanonicalConversationMentionTrigger {...props}
    debounceMs={300} />;
}
```

## 属性与 API



### API

在 `CanonicalConversationMentionTrigger` 上设置以下属性。

无独立根外观属性。

| 属性            | 类型                                                        | 省略时 / 用途                                                                     |
| ------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `source?`     | [`ConversationMentionSource`](#conversationmentionsource) | 从已有提及数据源搜索候选项；缺少时不显示提及候选界面                                                   |
| `debounceMs?` | `number`                                                  | 搜索防抖；省略时沿用底层触发器默认值                                                           |
| `onSelect?`   | `(item, { text, range }) => string \| null`               | 完全替换默认插入；返回项目文本或移除查询。见[选中与发送格式](/development/composer-sources.md#在项目中替换选中行为) |

文案字段见统一 `conversationTriggers` 命名空间。

#### 搜索输入和返回候选 \{#conversationmentionsource}

`source.search({ query, signal })` 接收当前查询文本和取消信号，异步返回 `readonly ConversationMentionItem[]`。请求代码应传递 `signal`，让已过期搜索能够取消；选中项会交给 `onSelect`，实际插入的非空文本会绑定原始选择的 JSON 快照，供 Composer 读取。


每个候选必需 `id: string`（稳定业务 ID）、`type: string`（提及类别）、`label: string`（展示文字），可选 `description: string` 和 `data: unknown`。`data` 的格式由项目定义，值必须是 JSON；原始选中项由 Composer 决定如何发送。

默认支持 `user`、`resource`、`file`、`document` 引用标签。前面的[保存业务标识示例](#交给-composer-的数据)保留原始候选项；完整搜索请求接入见[提及数据源](/development/composer-sources.md)。


候选来自 `source.search({ query, signal })`，选择后的插入行为由 `onSelect` 决定；业务数据直接定义在候选项中，最终请求由 [Composer requestAdapter](/plugins/composer.md#请求适配) 组装。未配置 Composer 适配器时只发送正文引用，不自动添加结构化外带字段。请求应透传 `signal`，防止旧搜索覆盖新结果。

其他结果卡片需要直接填入问题、引用或附带业务参数时，使用 [Composer 的填入示例](/plugins/composer.md#example-3)。


