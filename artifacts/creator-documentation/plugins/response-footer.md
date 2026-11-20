# 回复操作栏（response-footer）

在完整回答后组合复制、重试、评价、导出和版本切换操作。





## 回复操作栏


![回复操作栏界面](/images/plugins/response-footer.png)

操作栏读取当前回答的消息和完成状态。回复通过 `TEXT_MESSAGE_*` 更新，生成结束时发送 `RUN_FINISHED`；默认运行期间隐藏操作栏。复制、重试、评价和导出分别使用已组合的操作插件，事件格式见[文字回复](/plugins/ag-ui-data.md#共用的-sse-格式)。

## 回复完成后始终显示 \{#回复完成后始终显示}


hideWhenRunning 隐藏生成中的操作栏；autohide=never 让回复完成后无需鼠标悬停即可看到操作。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseFooter } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalResponseFooter>) {
  return <ConversationCanonicalResponseFooter {...props}
    actionBarProps={{ ...props.actionBarProps, hideWhenRunning: true, autohide: "never" }} />;
}
```


## 操作间距与版本按钮 \{#操作间距与版本按钮}

合并嵌套对象后修改样式，原有 actions 插槽与回复级作用域继续使用。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseFooter } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalResponseFooter>) {
  return <ConversationCanonicalResponseFooter {...props}
    actionBarProps={{ ...props.actionBarProps, style: { ...props.actionBarProps?.style, gap: 8 } }}
    branchPickerProps={{ ...props.branchPickerProps, hideWhenSingleBranch: true }} />;
}
```


## 自定义回复操作组合 \{#自定义回复操作组合}

以下展示组件在现有回复作用域内组合复制和独立导出按钮。生成项目已使用 actions 插槽时，优先在该插槽中调整操作插件；直接传 actions 不会覆盖已配置的插槽。

```tsx
import type { ComponentProps } from 'react';
import {
  ConversationCanonicalResponseFooter,
  ConversationCanonicalResponseCopyAction,
  ConversationCanonicalResponseExportMarkdownAction,
} from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalResponseFooter>) {
  return <ConversationCanonicalResponseFooter {...props} actions={<>
    <ConversationCanonicalResponseCopyAction />
    <ConversationCanonicalResponseExportMarkdownAction presentation="button" />
  </>} />;
}
```

## 收藏或保存整次回答 \{#收藏或保存整次回答}

在 `plugins/response-footer/index.tsx` 的已有 `actions` 中加入自己的按钮。通过 `useResponse()` 读取整次回答；工具续跑产生的多段助理文字会合并到 `text`，不用自己取最后一条消息。

| 传给业务保存接口的内容    | 读取位置                                   |
| -------------- | -------------------------------------- |
| 本轮用户问题的消息 ID   | `group.requestMessageId`；旧历史可能为 `null` |
| 本次回答的全部助理消息 ID | `group.assistantMessageIds`            |
| 当前版本的整轮文字      | `text`；不包含工具结果、图表或附件本体                 |

以下 `save` 接项目已有的收藏、知识库或业务记录方法，`label` 来自项目文案，`onError` 接业务错误提示：

```tsx
import { useState } from 'react';
import { useResponse } from '@za38.03/agent-ui-plugins';

interface ResponseRecord {
  requestMessageId: string | null;
  assistantMessageIds: readonly string[];
  text: string;
}

export function SaveResponse({ save, label, onError }: {
  save: (record: ResponseRecord) => Promise<void>;
  label: string;
  onError: (error: unknown) => void;
}) {
  const response = useResponse();
  const isRunning = useResponse(snapshot => snapshot.isRunning);
  const hasText = useResponse(snapshot => snapshot.text.trim().length > 0);
  const [pending, setPending] = useState(false);
  async function submit() {
    const snapshot = response.getSnapshot();
    if (pending || snapshot.isRunning) return;
    setPending(true);
    try {
      await save({
        requestMessageId: snapshot.group.requestMessageId,
        assistantMessageIds: [...snapshot.group.assistantMessageIds],
        text: snapshot.text,
      });
    } catch (error) { onError(error); }
    finally { setPending(false); }
  }
  return <button type="button"
    disabled={pending || isRunning || !hasText}
    onClick={() => { void submit(); }}>{label}</button>;
}
```

保留原有 `actions` 插槽和其他操作，只在其中追加这个组件。切换回答版本后，按钮读取该版本的内容；生成结束后再允许保存。

## API



在 `ConversationCanonicalResponseFooter` 上设置以下属性。

继承 `div` 原生属性，排除 `children`。

| 属性                   | 类型                                                        | 省略时 / 用途                     |
| -------------------- | --------------------------------------------------------- | ---------------------------- |
| `actions?`           | `ReactNode`                                               | 操作栏内容；插件入口默认从 `actions` 插槽取得 |
| `actionBarProps?`    | `Omit<ConversationResponseActionBarProps, 'children'>`    | 操作栏配置，见下表                    |
| `branchPickerProps?` | `Omit<ConversationResponseBranchPickerProps, 'children'>` | 分支切换配置，见下表                   |

| 嵌套属性                                      | 类型                                                              | 省略时 / 用途                      |
| ----------------------------------------- | --------------------------------------------------------------- | ----------------------------- |
| `actionBarProps.hideWhenRunning?`         | `boolean`                                                       | 默认 `true`，运行时隐藏               |
| `actionBarProps.autohide?`                | `'always' \| 'not-last' \| 'never'`                             | 默认 `not-last`，控制哪些回答的操作栏自动隐藏  |
| `actionBarProps.autohideFloat?`           | `'always' \| 'single-branch' \| 'never'`                        | 控制浮动操作栏何时自动隐藏，省略时使用现有操作栏的默认设置 |
| `actionBarProps.asChild?`                 | `boolean`                                                       | 把操作栏属性传给已有子元素，避免再增加一层容器       |
| `actionBarProps.render?`                  | `ReactElement`                                                  | 自定义操作栏元素                      |
| `branchPickerProps.hideWhenSingleBranch?` | `boolean`                                                       | 默认 `true`，单分支或不能切换时隐藏         |
| `branchPickerProps.previousProps?`        | `Partial<Omit<ConversationTooltipIconButtonProps, 'children'>>` | 上一分支按钮                        |
| `branchPickerProps.nextProps?`            | `Partial<Omit<ConversationTooltipIconButtonProps, 'children'>>` | 下一分支按钮                        |

两个嵌套对象均继承 `div` 原生属性，排除 `children`。分支切换针对当前整次回答，继续使用现有会话的方法。


`useResponse(): ConversationResponseRuntime` 从 Plugins 根入口导入。需要 Runtime 对应入口时，`useAssistantResponseRuntime(): AssistantResponseRuntime` 从 `@za38.03/agent-ui-runtime/plugin-api` 导入。两者读取同一个回复上下文。无参数返回 `getSnapshot()`、`subscribe()` 和回复操作方法，不自动订阅数据；传入 selector（如 `snapshot => snapshot.canReload`）订阅所需字段。下表的数据字段由 selector 或 `getSnapshot()` 读取：

| 成员                                                  | 类型或签名                   | 用途                             |
| --------------------------------------------------- | ----------------------- | ------------------------------ |
| `group`                                             | `ConversationTurnGroup` | 本轮问题与助理消息 ID，供业务记录关联           |
| `text`                                              | `string`                | 当前回答版本的全部助理文字，适合保存或导出          |
| `isRunning`                                         | `boolean`               | 生成期间可禁用需要完整回答的操作               |
| `canReload`                                         | `boolean`               | 是否允许重新生成，点击调用 `reload(): void` |
| `canSwitchBranch`                                   | `boolean`               | 是否允许切换回答版本                     |
| `branchNumber` / `branchCount`                      | `number`                | 当前版本从 1 开始，以及总版本数              |
| `switchToPreviousBranch()` / `switchToNextBranch()` | `() → void`             | 切换到上一／下一版本；按钮同时检查允许切换及版本边界     |

这些 Hook 必须位于已有的 Response Footer 上下文；放到任意消息外、缺少上下文时会抛错。


为什么 actions 属性没有替换现有按钮？

项目已配置 actions 插槽时，先修改该插槽中的插件组合。操作内容统一通过 actions 或已有 actions 插槽组合。
