# Composer Mention / Slash 插件接入

## 范围与交付

本次提供两个可独立安装、启停和移除的 UI Plugin：

- `assistant-ui-mention-trigger`：输入 `@`，异步搜索人员或资源，插入包含稳定 ID 的 directive。
- `assistant-ui-slash-command-trigger`：输入 `/`，在同一列表中选择前端动作或文本指令。

沿用 canonical Composer、Input、附件和提交行为。现有 Quote 保持原有实现，不参与这次改造。

```text
AppUIModel
  ├─ applicationPlugins
  │    ├─ conversation-command-source
  │    └─ composer-trigger-demo（显式 Demo）
  └─ assistant-ui-composer.slots.triggers
       ├─ assistant-ui-mention-trigger
       └─ assistant-ui-slash-command-trigger
                ↓
       @agent-ui/react 公共 facade
                ↓
       assistant-ui TriggerPopoverRoot / 官方 Element
                ↓
       canonical Composer 文本 → AG-UI user message
```

UI Runtime 继续拥有 SlotRegistry；AppUIModel 只记录实例配置和组合。两个 Plugin 从现有 Plugin Service 读取来源，不创建 Agent Runtime。生成应用的运行与构建不依赖 Creator。

## Composer 与上游边界

`assistant-ui-composer` 新增可选、many cardinality 的 `triggers` Slot，通过 `renderSlot("triggers", null)` 交给 `ConversationCanonicalComposer`。

canonical Composer 统一持有一个官方 `Unstable_TriggerPopoverRoot`。两个触发器由 facade 封装 unstable API，插件只导入 `@agent-ui/react`。候选菜单留在 Composer 范围内，采用现有 vendor CSS 和 AgentUIRoot 主题，不创建新的 body Portal。

官方 Element 仅增加通用 `children` 接入点，用于注册选择行为覆盖。产品逻辑位于内部 adapter。上游纯 matcher 从固定 revision 原样复制，用于定位指令替换的范围；同步脚本同时更新它和 provenance，guard 校验固定映射、revision 和 SHA256。不会修改 node_modules。

## Mention 来源

公共契约位于 `packages/react/src/public.tsx`：

```ts
interface ConversationMentionSource {
  cacheKey: string | number;
  subscribe?(listener: () => void): () => void;
  search(input: {
    query: string;
    signal: AbortSignal;
  }): Promise<readonly ConversationMentionItem[]>;
}

interface ConversationMentionItem {
  id: string;
  type: string;
  label: string;
  description?: string;
}
```

提供者通过现有 `setup({ services })` 提供 `conversation.mention-source`。UI Plugin 使用 optional injection；未配置来源时不显示候选菜单。

提供者必须使用真实稳定 ID；显示名只负责呈现。账号、权限、语言或数据变化时更新 `cacheKey`。替换来源对象会自动失效缓存；同一对象内部更新时，使用 `subscribe` 通知订阅者。`search` 应遵守传入的 AbortSignal。

facade 复用官方 live completion hook 进行 debounce、loading 和过期响应隔离，并补充请求取消、来源身份失效和候选校验。查询变化后不显示前一次查询的候选。来源切换、cacheKey 更新、禁用、线程切换或插件卸载会取消关联请求。

每个候选必须通过官方 formatter 的 serialize/parse 往返校验，重复 ID 或非法字段不会进入菜单。搜索失败、空结果、loading、重试和非法候选提示均使用 locale 文案。

选择 Mention 只改变草稿，不发送请求。例如：

```text
:user[张三]{name=employee_84721}
```

HTTP Agent 收到的是包含上述稳定 ID 的普通 user text；本次未改变 AG-UI 协议。后端如何解释 directive 属于应用自己的约定。

## Slash 命令

`conversation.slash-command-source` 提供同步快照和订阅：

```ts
type ConversationSlashCommand =
  | { id: string; label: string; description?: string;
      disabled?: boolean; mode: "action";
      execute(): void | Promise<void> }
  | { id: string; label: string; description?: string;
      disabled?: boolean; mode: "directive" };
```

生成项目提供 `createConversationCommandRegistry()`，拥有 `getSnapshot`、`subscribe` 和 `register`。`register` 返回本次注册的清理函数，拒绝重复 ID；清理旧注册不会删除后续同名注册。提供者在组件的 effect 中注册并在卸载时清理。

| mode | 选择后的行为 | Agent 请求 |
| --- | --- | --- |
| `action` | 官方 Action 消耗触发文本，然后调用项目回调 | 不自动发送 |
| `directive` | adapter 替换当前触发范围为 command directive | 用户主动发送后才产生 |

默认 `conversation-command-source` 注册 `/new`，通过公共 Conversation navigation 新建会话。`/summarize` 只由显式 Demo 注册，插入：

```text
:command[总结]{name=summarize}
```

混合列表保留官方 Action 行为；directive 项通过选择覆盖插入精确范围，不会执行 action 回调。前后文本保持不变。动作执行期间阻止重复触发；失败提示使用 locale；离开原线程或卸载后不把延迟错误显示到其他线程。

## 历史消息与本地化

canonical UserMessage 的 Text part 使用官方 DirectiveText Element。支持 user、resource、file、document、command；未知类型保留原始文本。展示层不修改持久化消息或发送内容。

DirectiveText 属于 canonical 消息呈现，因此删除 Mention / Slash 插件后，已有消息仍可显示标签。输入区继续使用官方普通文本输入，不引入 Lexical 或新的 Composer 模型。

新增命名空间 `conversationTriggers` 和 `composerTriggerDemo`，提供完整的 zh-CN / en-US 文案。真实人员或资源的名称由来源提供。Demo 根据 locale 更新显示标签和 cacheKey，稳定 ID 保持一致。

## 安装与演示

三个默认预设均包含两个触发器及 `conversation-command-source`，不包含 Demo 名单。触发器 Source Item 依赖 Composer，保证安装时取得具有 `triggers` Slot 的版本。

现有项目可通过官方资源安装器安装：

| Resource ID | 内容 |
| --- | --- |
| `conversation-command-source` | application 级命令提供者 |
| `conversation-mention` | Composer Mention 触发器 |
| `conversation-slash-commands` | Composer Slash 触发器 |
| `composer-trigger-demo` | application 级异步 mock 名单和 summarize 注册 |

展示场景 `composer-mention` 和 `composer-slash` 明确请求命令提供者、对应触发器和 Demo。继续走已有资源安装事务，不额外添加 Creator 自动迁移或生产数据接口。自定义来源与 Demo 同时提供同一个 Service 时，遵守现有唯一提供者规则，替换配置后再启用。

来源有本地定制时，继续遵守 Source Registry 的定制保护，不能用覆盖写入绕过冲突。移除能力通过 AppUIModel 禁用或删除对应触发器；提供者可独立管理。

资源安装过程中修复两个直接阻塞：

1. optional resource 使用项目配置的 sourceRoot 和 source lock；移除依据不存在的 version 字段无条件切换到 `.` 的旧分支。
2. Creator Action Catalog 把 `RESPONSIVE_DRAWER_INDEX_INVALID` 识别为具体候选的布局拒绝，跳过该候选；未知异常仍作为系统错误抛出。

## 实施与检查记录

已完成：公共 facade、上游 Element/matcher 与同步 guard、两个触发插件、默认命令服务、显式 Demo、三个预设、官方资源和展示场景、双语文案及回归测试。

自动化回归覆盖：

- 实际 Composer 的异步搜索、稳定 ID 插入和 HttpAgent 请求内容。
- 混合命令选择、精确文本范围、前端动作不发送、动作失败及禁用项。
- 键盘方向键、Enter、Tab、Escape、IME composition Enter。
- 卸载、只读、未配置来源、来源身份变化、可订阅 cacheKey 更新、切换线程、取消及过期响应。
- 历史标签保留、未知类型回退、locale 完整性与 Portal 边界。
- command 注册/清理生命周期和 Demo 来源取消。
- 三种模式中，在自定义 sourceRoot 安装、重复安装、组合定位与资源所有权。
- 上游固定 matcher 和通用 child seam 的同步回放、形状漂移拒绝及完整性检查。

另外以三个临时新生成项目验证独立 typecheck / Vite 生产 build；Platform 显式安装 Demo 后再次通过。没有启动用户现有 Host 做浏览器验收。

仓库全量检查仍存在历史失败，需与本次聚焦检查分开：改动前的同一 HEAD 副本运行 React 全量 suite，已有 18 个失败文件、22 个失败测试和 7 个运行错误；涉及旧 migrated fixtures、Runtime mock、过时依赖断言等。React 的 migrated typecheck 也有缺失的 legacy helper 和旧 fixture 路径。本文不把这些检查声明为通过。

本次检查结果：

| 检查 | 结果 |
| --- | --- |
| React 聚焦回归（触发器、同步、guard、Portal、locale） | 35 项通过 |
| Source Registry 全量测试 | 17 项通过 |
| Bootstrap 全量测试 | 30 项通过 |
| Mock Agent 全量测试 | 95 项通过 |
| 新资源安装、资源所有权、Plugin 样式检查 | 10 项通过 |
| React 源码 typecheck、公开声明构建、上游 guard | 通过 |
| Project Control / Source Registry / Bootstrap / Mock Agent typecheck | 通过 |
| 三模式临时生成项目独立 typecheck / production build，Platform Demo build | 通过 |
| React 全量对照 | 21 个既有测试失败、7 个运行错误；失败集合无新增，locale 断言已修正 |
| React migrated typecheck、旧 Project Control migrated fixtures | 仍有历史问题，未声明通过 |
| 浏览器人工验收 | 未执行 |
