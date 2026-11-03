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
| `styles.css` | 项目样式覆盖 | 品牌色、间距和组件样式 |
| `services/` | 业务接入、服务声明及对应的 React Hook | 历史 HTTP 接口、认证、业务服务 |


不同版本或历史工程的目录可能不同，先检查已有组件的导入和导出。官方插件通常由项目入口导入 npm 实现；已经接管的插件则引用本地实现。

新工程只生成布局中选用的插件入口，以及读取服务、传入数据和显示子插件所需的代码，添加插件时再生成对应入口。已经存在的项目入口会保留。

服务相关 Hook 统一放在 `services/hooks/` 下：`useConversations.ts`、`useConversationActions.ts` 和按需生成的 `useAuthSession.ts`，不再按领域拆分子目录。插件通过相对路径调用这些 Hook；服务契约和实现不反向依赖 Hook。已有工程的旧 `hooks/` 目录不自动迁移。

主题和语言的公共服务标识、类型直接从 npm 导入，不生成 `services/agent-ui-theme.ts`、`services/agent-ui-locale.ts` 转导出文件。主题、语言和文案覆盖通过 `Agent` 属性配置；已有工程的同名文件保留。

可选弹窗、表单等示例按资源声明导入 `plugins/`、`services/` 等位置，之后作为项目自己的业务代码修改。工具只保留已导入文件的位置记录，不为示例维护官方源码基线，也不在 npm 升级或官方源码同步时更新这些文件。

## 根据修改目标选择入口

**布局和组合改 JSON，具体表现改组件代码。** 例如，改变附件按钮的顺序修改 `app-ui.json`；改变输入框高度修改 `plugins/composer/index.tsx` 中传入的属性。不要把 React props 或 renderer 写进布局 JSON。

普通组件定制无需复制官方源码，见[组件属性与组合定制](./component-customization)。插件共享已有会话和运行状态；不要为一个组件新建 Agent Runtime 或另一条 AG-UI 连接。

`plugins/registry.generated.ts` 等标有 generated 的文件由工具生成，不手工维护。新增插件后的注册步骤见[创建自定义插件](./create-plugin)。新初始化工程通过 `@za38.03/agent-ui-runtime/ui` 使用模型编译、插件运行和应用组装能力，不再生成 `runtime/`、`framework/`，默认展示组件、语言表和状态转换代码继续由 npm 包提供，也不会生成空的事件或工具示例。前端工具和会话集成的文件按实际安装资源生成。历史工程可能仍有这些目录；升级 npm 不会自动删除它们或改写已有定制。

## 开发与检查

沿用当前工程的包管理器和脚本，查看 `package.json` 中已有的 `dev`、`test`、`typecheck`、`build`。不同工程的开发命令可以不同。

修改后运行对应检查，再到实际页面验证。新增渲染器需要触发对应数据；类型检查通过并不证明流式、审批或历史回放行为正确。
