---
title: "工程结构与修改入口"
---

# 工程结构与修改入口

初始化后，Agent UI 源码默认放在 `src/agent-ui/`。以下路径都相对于这个目录；初始化时选择了其他目录，就在实际目录中找同名文件。

| 位置 | 用途 | 常见修改 |
| --- | --- | --- |
| `index.ts`、`application/Agent.tsx` | 项目提供给业务页面的 Agent 入口 | 配置属性、页面集成 |
| `app-ui.json` | 布局与插件组合 | 区域大小、实例位置、顺序、启停 |
| `plugins/<插件名>/index.tsx` | 项目组件入口 | 传入属性、组合组件、自定义渲染 |
| `plugins/<插件名>/definition.ts`、`manifest.json` | 插件定义和能力声明 | 注册组件、消息渲染器、服务和子插槽 |
| `application/project-config.tsx` | 生成资源的组装入口 | 绑定 AppUIModel、插件目录与开发观测；业务配置通过 `Agent` 属性传入 |
| `application/shell/` | 助手外壳及其 CSS | 悬浮入口、面板位置、尺寸和展开收起 |
| `application/locales.ts` | 项目的官方文案覆盖 | 欢迎语、推荐问题、按钮和提示文字 |
| `styles.css` | 项目样式覆盖 | 品牌色、间距和组件样式 |
| `services/` | 业务接入、服务声明及对应的 React Hook | 历史 HTTP 接口、认证、业务服务 |


不同版本或历史工程的目录可能不同，先检查已有组件的导入和导出。官方插件通常由项目入口导入 npm 实现；已经接管的插件则引用本地实现。

## 接口与适配器目录

先到[业务服务接入总览](./service-integration)选择能力。历史 HTTP 配置已有固定入口 `services/conversations/http-data-source.ts`；其余可按教程新建 `services/attachments.ts`、`feedback.ts` 等项目文件，再在实际挂载 `<Agent />` 的业务页面导入并传 props。新建文件不代表自动注册生效。

请求方法、业务成功码和返回字段转换放在对应项目数据源内；AG-UI 传输通过 `Agent fetch` 适配。组件外观在 `plugins/<id>/index.tsx` 中调整。Vue/HTML 的函数适配写在 React 生产工程中，重新构建后更新宿主加载的资源。

新工程只生成布局中选用的插件入口，以及读取服务、传入数据和显示子插件所需的代码，添加插件时再生成对应入口。已经存在的项目入口会保留。

服务相关 Hook 统一放在 `services/hooks/` 下：`useConversations.ts`、`useConversationActions.ts` 和按需生成的 `useAuthSession.ts`，不再按领域拆分子目录。插件通过相对路径调用这些 Hook；服务契约和实现不反向依赖 Hook。已有工程的旧 `hooks/` 目录不自动迁移。

主题、语言和文案覆盖通过 `Agent` 属性配置；只有编写服务消费代码时才需从 npm 导入公共服务标识和类型，入口见[插件 API](./plugin-api#内置领域-hook)。

导入的可选业务示例作为项目代码维护，npm 升级不会自动更新它们。已有表单可以直接通过[前端工具](./frontend-tools)开放页面方法，无需先导入一个示例。

## 修改入口选择

**布局和组合改 JSON，具体表现改组件代码。** 例如，改变附件按钮的顺序修改 `app-ui.json`；改变输入框高度修改 `plugins/composer/index.tsx` 中传入的属性。不要把 React props 或 renderer 写进布局 JSON。

按[手动修改插件教程](./component-customization)在项目入口设置组件属性、组合和业务回调。插件通过现有 Hook 读取会话和运行状态。

`plugins/registry.generated.ts` 由注册命令更新，新增插件后的操作见[创建自定义插件](./create-plugin)。前端工具和会话集成的文件按实际启用的功能生成；已有项目沿用自己的目录和定制。

## 开发与检查

沿用当前工程的包管理器和脚本，查看 `package.json` 中已有的 `dev`、`test`、`typecheck`、`build`。不同工程的开发命令可以不同。

修改后运行对应检查，再到实际页面验证。新增渲染器需要触发对应数据；类型检查通过并不证明流式、审批或历史回放行为正确。
