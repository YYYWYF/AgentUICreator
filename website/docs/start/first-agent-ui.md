---
title: 把助理放到页面中
---

# 把助理放到页面中

## 1. 导入生成的组件

初始化完成后，在 Creator 顶部找到「Agent UI 已创建」，点击右侧 **查看接入方法**，查看当前工程的导入路径。

![点击 Agent UI 已创建卡片右侧的查看接入方法。](/images/start/05-initialized.png)

如果上一步使用 `src/agent-ui`，新建 `src/Assistant.tsx`，填入：

```tsx
import { Agent } from './agent-ui';

export function Assistant() {
  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      <Agent locale="zh-CN" />
    </div>
  );
}
```

打开要显示助理的页面组件，在文件顶部导入 `Assistant`。页面文件与 `Assistant.tsx` 都在 `src` 下时，写法为：

```tsx
import { Assistant } from './Assistant';
```

在该页面组件的 `return (...)` 中，找到要放置助理的位置，加入：

```tsx
<div style={{ height: '100dvh' }}>
  <Assistant />
</div>
```

这里给助理分配一个屏幕的高度。如果页面已有顶部栏，将高度改为顶部栏下方内容区的高度。源码目录或页面文件位置不同时，同步调整导入路径。

保存文件，回到浏览器打开对应页面。选择「工作台」时，应看到左侧会话列表、中间开场建议和底部消息输入框，如下图。

![助理已挂载到页面：会话列表在左侧，输入框在对话区底部。](/images/start/06-platform-mounted.png)

## 2. 配置演示对话服务

先用演示服务试发一条消息。已有可用的 AG-UI 接口时，可以直接跳到[接入自己的对话接口](#4-接入自己的对话接口)。

打开 `vite.config.ts`，找到安装 Creator 时添加的 `if (creatorEntry)` 分支。在分支内部、现有 Creator 插件代码后加入：

```ts
const mocks = await import('@za38.03/agent-ui-creator/mock-agent');
plugins.push(mocks.createMockAgentVitePlugin({
  endpoint: '/agent',
  scenarios: mocks.showcaseMockScenarios,
  defaultScenarioId: 'reasoning-tool-success',
}));
plugins.push(mocks.createMockConversationApiVitePlugin({
  endpoint: '/__agent-ui/mock-data',
}));
```

保存文件，重启工程开发服务器，再刷新页面。`Agent` 默认使用 `/agent`，与上面的演示服务地址一致。

## 3. 发送消息并查看回复

1. 如果 Creator 面板仍展开，点击右上角「收起 Creator」。
2. 在页面助理底部的 **发送消息…** 输入框中输入「请演示一次思考、工具执行和最终回复。」。
3. 点击输入框右下角的向上箭头。
4. 等待对话区出现思考、工具执行记录和最终回复。

![消息发出后，对话区依次出现思考、已搜索文件和最终回复。](/images/start/07-demo-conversation.png)

演示服务返回预设内容。看到上述结果后，就可以换成自己的对话接口。

## 4. 接入自己的对话接口

删除 `vite.config.ts` 中上一步添加的两个演示服务插件。在 `src/Assistant.tsx` 中找到 `Agent`，添加 `endpoint`：

```tsx
<Agent locale="zh-CN" endpoint="/api/agent" />
```

将 `/api/agent` 替换为自己的 AG-UI 接口地址，按服务要求配置鉴权、代理和会话数据服务。重启开发服务器，再发送一条消息，确认收到业务 Agent 的回复。

最后运行工程原有的测试和构建命令，确认助理和原有页面都能正常使用。

接下来[用 AI 修改界面](./ai-assisted)。需要手动修改时，查看[文件位置](./generated-files)。
