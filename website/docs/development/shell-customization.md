---
title: "自定义 Shell"
description: 在项目中修改助手外壳、容器与展开收起行为，保持会话和后台运行。
---

# 自定义 Shell

Shell 是助手最外层的产品容器，负责悬浮入口、面板位置、尺寸、动画和展开收起。直接编辑生成工程 `application/shell/` 中的组件和 CSS 即可调整。

内层列表、聊天区和插件的排列由[AppUIModel](./layout-and-composition)控制；业务页面显示哪个助手由[多助手的 `hidden`](./multiple-agents#多助手与受控显示)控制。Shell 接收当前助手的内容，负责把它放进外层容器。

## 1. 找到现有外壳与绑定

默认源码目录为 `src/agent-ui/`。初始化只生成所选形态的组件与 CSS：

| 初始化形态 | 项目文件 |
| --- | --- |
| 悬浮助手 | `application/shell/AssistantShell.tsx`、`assistant-shell.css` |
| 嵌入式助手 | `application/shell/EmbeddedShell.tsx`、`embedded-shell.css` |
| 工作台 | `application/shell/PlatformShell.tsx`、`platform-shell.css` |

打开 `application/project-config.tsx`，找到现有 `createAgentUIProject({ Shell: ProjectShell, ... })`，沿着 `ProjectShell` 的导出找到外壳组件。通常只需编辑这个组件和它导入的 CSS，保留项目配置中的其他设置。

如需绑定自己新写的组件，在这份项目配置中导入它，并将现有 `Shell` 值替换为该组件。例如，下面两行分别放入现有 import 区和配置对象中：

```tsx
import { AssistantShell } from './shell/AssistantShell';
// 现有 createAgentUIProject({ ... }) 中：
// Shell: AssistantShell,
```

初始化会绑定所选形态的外壳。后续调整在对应组件和 CSS 中完成；已有自定义 Shell 沿用当前绑定。

## 2. Shell 接口

类型从 `@za38.03/agent-ui-runtime/ui` 导入。

| 属性 | 作用 |
| --- | --- |
| `children: ReactNode` | Runtime 提供的内容，原样放入容器；关闭面板时仍保留挂载。 |
| `surfaceRef?: RefCallback<HTMLElement>` | 将当前可见内容容器报告给 Runtime，用于实际容器尺寸和界面观察。可能未提供，不是用来创建或切换会话的。 |
| `assistantPanelWidth?: number` | 业务页面传入的可选宽度，单位 px；外壳决定默认值，并用 CSS 限制到实际视口内。 |

始终可见的工作台或嵌入式外壳，把 `surfaceRef` 接到包住 children 的实际内容容器。悬浮面板收起时卸下这个 ref，展开后接回同一个面板；children 保持挂载。不要把 ref 接到悬浮按钮、页面 body 或通过查找父节点来猜测容器。

## 3. 悬浮外壳最小示例

下面展示已选择悬浮形态工程的最小结构。现有模板还有机器人动画等项目行为；只调整样式时保留已有逻辑，不必整体替换为此示例。

`application/shell/AssistantShell.tsx`：

```tsx
import { useId, useState, type CSSProperties } from 'react';
import { useAgentUILocale } from '@za38.03/agent-ui-plugins';
import type { AgentUIShellProps } from '@za38.03/agent-ui-runtime/ui';
import './assistant-shell.css';

export function AssistantShell({
  children,
  surfaceRef,
  assistantPanelWidth = 416,
}: AgentUIShellProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const labels = useAgentUILocale('runtime');
  const width = Number.isFinite(assistantPanelWidth) && assistantPanelWidth > 0
    ? assistantPanelWidth : 416;

  return <section className="project-assistant-shell"
    style={{ '--project-assistant-width': `${width}px` } as CSSProperties}>
    <div id={panelId} className="project-assistant-panel"
      ref={open ? surfaceRef : undefined}
      hidden={!open} role="complementary" aria-label={labels.assistant}>
      {children}
    </div>
    <button className="project-assistant-trigger" type="button"
      aria-controls={panelId} aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      {open ? labels.closeAssistant : labels.openAssistant}
    </button>
  </section>;
}
```

`application/shell/assistant-shell.css`：

```css
@layer components {
  .project-assistant-panel {
    position: fixed;
    right: 16px;
    bottom: 80px;
    z-index: 1000;
    width: min(var(--project-assistant-width, 416px), calc(100vw - 32px));
    height: min(640px, calc(100dvh - 96px));
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    color: var(--card-foreground);
  }
  .project-assistant-panel[hidden] {
    display: none;
  }
  .project-assistant-panel > .development-preview {
    height: 100%;
  }
  .project-assistant-trigger {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 1000;
    max-width: calc(100vw - 32px);
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    color: var(--card-foreground);
    cursor: pointer;
  }
}
```

CSS 导入保留在外壳组件中，并沿用工程已配置的样式编译和层级。示例使用当前主题变量与 `runtime` 文案。新增业务文案放入项目语言模块，见[语言与文案](./localization#新增业务文案)。

业务页面传 `<Agent assistantPanelWidth={480} />` 时，示例按 480px 布局；视口更窄时由 CSS 限宽。定位、层级和动画按现有业务页面调整。增加淡出动画也要保持 children，不用条件渲染卸载它们。

## 4. 嵌入式容器与后台运行

嵌入式外壳通常只需接收业务容器给定的空间：

```tsx
import type { AgentUIShellProps } from '@za38.03/agent-ui-runtime/ui';

export function EmbeddedShell({ children, surfaceRef }: AgentUIShellProps) {
  return <section ref={surfaceRef}
    style={{ height: '100%', minHeight: 0, minWidth: 0 }}>
    {children}
  </section>;
}
```

业务页面需为挂载区域设置实际高度，例如固定高度或已有 flex/grid 中可用的剩余空间；仅设 `height: 100%` 而祖先没有高度，无法得到预期聊天区。这个例子不负责展开收起，开关由业务容器决定。

悬浮外壳同样遵循“隐藏仍挂载”：不要写 `open ? children : null`，也不要在开关时改变助手的 `key`、`agentId` 或默认 `endpoint`。关闭面板不等于停止 Agent；如产品确实需要停止，由明确的停止操作调用已有 Host／Thread 方法。

## 5. 验证

运行工程已有的 typecheck 和 build，确认生产构建包含组件与 CSS，且不需要 Creator。页面中再检查：

- 发送慢速请求，收起后展开，消息继续生成，Thread 与 Plugin 服务没有重新初始化；待发送队列也保留。
- 打开／关闭按钮的键盘焦点、名称和 `aria-expanded` 正确，隐藏面板内的按钮不可聚焦。
- 宽屏、窄容器、窗口缩放及浅色／深色／紫色主题下，面板不溢出，发送和关闭入口可达。
- 嵌入式按业务容器尺寸布局；开发观察开启时，内容容器的宽高随实际尺寸变化，隐藏的悬浮面板不被当成可见容器。

收起与重新打开属于页面内生命周期；卸载或刷新页面会结束当前页面的会话运行生命周期。
