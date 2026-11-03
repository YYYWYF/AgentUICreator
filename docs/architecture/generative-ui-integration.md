# 可选 Generative UI

公开入口为 `@za38.03/agent-ui-plugins/generative-ui`。实现使用目标项目实际安装的 `@assistant-ui/generative-ui/react`，共享展示和样式由 Plugins 包维护。

## 公开工厂

- createAgentUIGenerativeUI(options?) 创建 JSONGenerativeUI，合并默认 styled vocabulary 与 options.components，并按传入的 options.actions 绑定动作。
- createAgentUIGenerativeActions(handlers) 使用现有 action registry 工厂创建显式 handler 集合。
- GenerativeUILibrary、ActionRegistry 与 AgentUIGenerativeUIOptions 描述组件和动作合同；具体字段以已安装声明为准。

该入口是可选 UI 与动作组合，不自动创建 Plugin、修改 AppUIModel 或向业务 Agent 暴露 Frontend Tool。用户工程拥有实际依赖、数据来源、组件和授权动作。

普通 JSON Generative UI、后端 Tool 结果展示、Frontend Tool 执行各有自己的合同。使用公开 vocabulary 和实际已绑定的动作，不从外观推断后端能力，不执行未明确注册的操作。

项目先使用已安装组件和样式，不复制上游 renderer 或创建第二个 Conversation Runtime。验证实际 schema 渲染、数据更新、已绑定动作、失败状态、主题、语言和宿主隔离；类型可用不代表业务动作或浏览器行为已通过。
