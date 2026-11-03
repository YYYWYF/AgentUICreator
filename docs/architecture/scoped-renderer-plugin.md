# Scoped Renderer Plugins

AppUIModel 的每个占用插槽都明确选择已有 Plugin。普通 content Slot 用于静态组合；renderer Slot 表示父级针对一个 runtime entity 提供渲染上下文。renderer Slot 的 cardinality 为 one，并声明接受的 capability。

## 公开合同

从 `@za38.03/agent-ui-plugins/contracts` 使用 UIPluginComponentProps、UIPluginRenderScope 和 PluginChildSlotDefinition。

- `renderSlot(name, fallback?, options?)` 渲染普通子内容；options 支持 layout 的 stack/inline 和 sizing 的 content/fill。
- `renderScopedSlot(name, { kind, value }, fallback?)` 渲染带作用域的子插件。
- 子插件通过 `@za38.03/agent-ui-plugins` 的 `usePluginRenderScope()` 读取 scope，检查实际 kind 后使用 value。
- 需要 scope 的 Plugin 声明 requiresRenderScope；不能把它当成普通静态内容挂载。
- 未选择、禁用或不可用的 renderer 不会触发另一套 Plugin 自动注册。父级明确声明的 fallback 是降级内容，不是隐式恢复被移除的实例。

Runtime 继续管理 Plugin 身份、激活、Service 和 SlotRegistry。scope 是当前实体展示数据，不是另一套 Runtime Context，也不是任意跨插件状态总线；共享能力使用 Service。

## Conversation Surface

conversation-surface 的 reasoningGroup、toolGroup、toolFallback、taskGroup、assistantResponseFooter 和 userEditComposer 是语义替换边界。父级保留 Thread 分组、part 顺序、工具优先级、运行与消息生命周期，不把上游内部 HTML 部件拆进 AppUIModel。

response-footer 在 assistantResponseFooter 中组合一次，动作通过 Response Context 访问当前回复。详见 [回复操作栏](assistant-response-footer.md)。

Composer 使用 beforeInput、leadingActions、trailingActions、submitAction、triggers 和可选 input 语义插槽。当前实例和接受能力由实际安装的 composer manifest 决定；textarea、附件、输入、dropzone 和提交继续属于同一个 Composer 生命周期。

## 可选 Lexical 的生命周期

启用和定制分别见 [主输入](../../website/docs/plugins/lexical-composer-input.mdx) 与 [历史编辑](../../website/docs/plugins/lexical-edit-composer.mdx)。默认 preset 使用 textarea；`lexical-composer-input` 在 `composer.input` 提供 `conversation-composer-input`，不替换附件、引用、triggers 或提交壳。

`lexical-edit-composer` 在 `conversation-surface.userEditComposer` 提供 `conversation-user-edit-composer-renderer`，声明 requiresRenderScope 并消费 `conversation.user-edit-composer` scope。父级明确提供 textarea fallback；消息身份、编辑草稿和分支仍由现有 Runtime 维护。关闭或移除富文本展示不应破坏草稿，主输入和历史编辑独立启停。

编辑初始化、选择、原子 directive、IME、撤销、Cancel/Update 和分支交给现有 Conversation Runtime 与上游编辑器。renderer 不自行 setText 初始化、不重复注册 Mention/Slash picker，不复制 Context 或协议。可选入口保留原生 input/composition props；依赖以实际安装元数据和锁文件为准，主包普通入口不导入 Lexical 实现。

## 项目定制

先修改薄应用层 props、children、renderer 或公开插槽。添加本地插槽时同步 manifest、definition 和真实渲染出口，保留官方已有合同。源码接管不是新增语义出口的前置条件，详见 [插件所有权](npm-default-plugin-source-ownership.md)。
