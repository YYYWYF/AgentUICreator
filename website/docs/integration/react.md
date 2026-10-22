---
title: 在 React 工程中接入 Agent UI
---

# 在 React 工程中接入 Agent UI

先在现有 React 工程中完成[初始化](../start/)。以下假设源码位置为 `src/agent-ui`，实际导入路径以「查看接入方法」为准。

```tsx
import { Agent } from './agent-ui';
export function AssistantPage() {
  return <section style={{ height: '100dvh', minHeight: 0 }}>
    <Agent locale="zh-CN" endpoint="/api/agent" />
  </section>;
}
```

把组件放入现有业务内容区域。已有顶部栏时，使用剩余内容区高度；flex/grid 父容器通常还需要 `min-height: 0`，以便消息区内部滚动。保留原有业务导航，不为嵌入助理额外引入页面体系。

## 工程依赖与样式

Host React 与 React DOM 使用匹配版本，满足已安装包的 peers。当前公开 React peers 为 `>=18 <20`，仓库固定开发版本不是外部工程必须采用的版本。工程 UI 库和样式方案仍由工程自己决定。

官方 Plugin 样式沿用生成项目配置，使用公开 CSS 出口或现有生成样式入口。不要把 Creator 的 UI 依赖当作业务依赖，也不要漏掉生产 CSS。

## 验证

先连接[Mock](../guide/mock/)检查空态、发送、流式、工具和错误，再切真实接口。确认 Host 全局 `main`、`button` 等选择器不会影响助理内部布局。

运行工程自己的测试、类型检查和构建。组件成功挂载不代表历史、附件、语音、反馈已接入，这些功能分别需要服务。

> 截图待补：原业务页面与助理共存的容器、窄屏滚动和明确尺寸，不额外包裹与教程无关的卡片外框。

参数接入见[Agent 参数与配置](./agent-options)，业务联动见[Host 控制](./react-host-control)，上线见[生产部署](./production-build)。
