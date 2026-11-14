# 手动修改插件：样式与业务逻辑

本教程以已有的 `composer` 输入区为例：先调整样式，再加入“获取草稿”按钮，调用业务接口填入当前输入框，最后让发送插件与输入区共享字数设置。全部示例使用当前公开 API，生产应用无需运行 Creator。

路径默认以 `src/agent-ui/` 为生成目录。已有工程选了其他目录时替换此前缀。**第 3～5 节依次修改同一个输入区；第 6 节是可选扩展。** 文中写明“局部修改”的代码只合入对应位置，不覆盖其他已有定制。

## 1. 插件与文件定位

### Plugin ID 定位

打开 `src/agent-ui/app-ui.json`，搜索对应的 `pluginId`。例如输入区是 `composer`，其 `submitAction` 子插槽中一般放 `submit-action`。保留原有实例 `id`、其他子插槽和启用关系。

再打开 `src/agent-ui/plugins/composer/definition.ts`，沿着 `Component` 的导入找到 `index.tsx`。默认 npm 应用入口的核心代码类似：

```tsx
import { ConversationComposerPlugin as Composer } from '@za38.03/agent-ui-plugins/composer';
import type { ComponentProps } from 'react';

export const ConversationComposerPlugin = (props: ComponentProps<typeof Composer>) => {
  return <Composer {...props} />;
};
```

这个文件就是项目的组件定制入口。`{...props}` 传递现有插槽和组件参数；已有代码包含 `renderSlot()` 等调用时，将本例的属性合入原组件，保留这些调用。

| 文件                               | 负责什么            | 本教程是否修改           |
| -------------------------------- | --------------- | ----------------- |
| `plugins/composer/index.tsx`     | 项目的组件属性、组合和回调   | 是                 |
| `plugins/composer/definition.ts` | 组件注册、服务提供和依赖    | 第 6 节才改           |
| `plugins/composer/manifest.json` | 插件身份、能力和子插槽声明   | 本例不需要改            |
| `plugins/composer/composer.css`  | 本教程新增的局部样式      | 是，需由组件导入          |
| `application/locales.ts`         | 官方已有文案的项目覆盖     | 是                 |
| `application/i18n/messages.ts`   | 本教程新增的业务双语文案    | 是；已有文件时合并         |
| `services/draft-template.ts`     | 本教程新增的业务请求与响应转换 | 是                 |
| `plugins/composer/source/`       | 明确接管后才存在的本地实现   | 第 7 节说明，不是前面步骤的前提 |

修改已有组件后，直接检查页面效果；新增插件或修改服务定义后，按第 6 节的命令更新 `registry.generated.ts` 注册表。

## 2. 定制入口选择

| 需求                              | 修改位置                                   |
| ------------------------------- | -------------------------------------- |
| 输入区的位置、宽度、插件顺序和启停               | `app-ui.json` 中已有的布局与实例                |
| 输入行数、最大长度、按钮外观、事件回调             | 项目插件 `index.tsx` 中的公开 props            |
| 局部样式、品牌主题                       | 插件自己的 CSS 或生成目录的 `styles.css`          |
| 提示文字、欢迎语、中英文                    | `application/locales.ts`；新增业务文案放共享消息模块 |
| 业务 URL、鉴权、请求／响应转换               | 项目 `services/`，从组件或 Agent 属性明确接入       |
| 多个插件共享业务状态                      | Plugin Service，见第 6 节                  |
| 公开 props、组合和 renderer 无法完成的实现修改 | 先评估第 7 节的源码接管                          |

布局和插件组合写在 `app-ui.json`，组件属性、业务函数和 renderer 写在项目代码中。会话状态和发送操作使用后面示例中的 Hook。

## 3. 插件样式定制

### 默认薄入口替换

对于第 1 节所示的默认入口，将 `plugins/composer/index.tsx` 改为：

```tsx
import { ConversationComposerPlugin as Composer } from '@za38.03/agent-ui-plugins/composer';
import type { ComponentProps } from 'react';
import './composer.css';

export const ConversationComposerPlugin = (props: ComponentProps<typeof Composer>) => {
  return <Composer
    {...props}
    rows={3}
    maxLength={2000}
    className={['project-composer-form', props.className].filter(Boolean).join(' ')}
    inputProps={{
      ...props.inputProps,
      minRows: 3,
      maxRows: 8,
      style: { ...props.inputProps?.style, fontSize: 16 },
    }}
  />;
};
```

新增同目录的 `plugins/composer/composer.css`：

```css
.project-composer-form {
  --composer-radius: 12px;
  --composer-padding: 12px;
  --composer-bg: var(--color-card);
  max-width: 100%;
}

.project-composer-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-block-end: 8px;
  color: var(--color-muted-foreground);
}

.project-composer-tools button,
.project-composer-tools select {
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-card);
  color: var(--color-foreground);
  font: inherit;
}

.project-composer-tools button:disabled { opacity: 0.5; }
.project-composer-tools button:focus-visible,
.project-composer-tools select:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 2px;
}

.project-composer-notice { margin: 0; font-size: 0.875rem; }
```

预期：默认输入框以三行起步，随内容增长至八行，字号 16px，输入区域圆角与内边距变化。这里 `className` 放在 Composer 根节点，`inputProps` 放在内部默认输入框；不要假设根节点样式会自动应用到 textarea。当前自动增高输入使用 `minRows/maxRows` 控制高度，其 style 类型限制直接设置 height/minHeight 等属性，按已安装声明配置。

`--composer-*` 由当前输入区实现使用，颜色沿用统一主题变量。项目已有配色时保持自己的变量；不要增加全局 `button`、`textarea` 选择器。默认样式导入及 `@source` 声明保留。主题覆盖见[主题与样式](/development/theme-and-styling.md)，完整文案表见[文案字段参考](/development/locale-reference.md)。

**如果没有变化：**&#x68C0;查 `composer.slots.input` 是否已有独立输入插件，或应用入口是否已经传了自定义 `input`。它们优先于默认 textarea，此时应改那个输入组件的项目入口。Lexical 等可选输入也应沿用其自身公开接口。

## 4. 文案与组件结构定制

### 提示文案覆盖

在 `application/locales.ts` 的已有语言对象中合并 `composer.placeholder`，保留其他领域。例如一个尚无覆盖的新文件可写成：

```ts
import type { AgentUILocaleCode, AgentUILocaleOverrides } from '@za38.03/agent-ui-plugins';

export const locales: Record<AgentUILocaleCode, AgentUILocaleOverrides> = {
  'zh-CN': { composer: { placeholder: '描述问题，或先获取一份草稿' } },
  'en-US': { composer: { placeholder: 'Describe your question or load a draft' } },
};
```

当前模板的 `application/project-config.tsx` 已绑定 `locales`。业务页面 `Agent locales` 对同名字段的覆盖优先；发现文案不变时检查该属性。

### 新增业务文案

新建 `application/i18n/messages.ts`；已有消息模块时合并 `composerCustomization` 领域，并复用已有统一读取函数：

```ts
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const zhCN = {
  composerCustomization: {
    load: '获取草稿', loading: '正在获取…', cancel: '取消获取',
    failed: '获取失败，请重试。', tooLong: '草稿超过当前输入上限，请调整上限后重试。',
    hint: '先核对草稿内容，再点击发送。',
    limit: '输入上限 {count} 字符',
  },
};
const enUS: typeof zhCN = {
  composerCustomization: {
    load: 'Load draft', loading: 'Loading…', cancel: 'Cancel loading',
    failed: 'Could not load the draft. Try again.', tooLong: 'The draft exceeds the current input limit. Adjust it and try again.',
    hint: 'Review the draft before sending.',
    limit: 'Input limit: {count} characters',
  },
};
const messages: Record<AgentUILocaleCode, typeof zhCN> = { 'zh-CN': zhCN, 'en-US': enUS };
export function getProjectMessages(locale: AgentUILocaleCode) { return messages[locale]; }
```

新增领域不直接塞入官方 `Agent.locales`。后面组件用 `useAgentUILocaleCode()` 读取统一语言，再消费这个业务领域，不创建另一份语言状态。

### 组件内容组合

第 5 节将把业务工具条放在 `<Composer />` 前，提示放在其后，保留内部的输入、附件、引用和发送插槽。若要放入现有语义子插槽，继续使用原来的 `renderSlot()` / `renderScopedSlot()`；不要删除它们。

`beforeInput` 等 props 有时是**空插槽的 fallback**：相应 Slot 已有子插件时，不能假设这个 prop 会与子插件自动拼接。固定业务内容可在应用层包裹组件；需要独立启停、排序的内容则创建子插件并放入现有 Slot，见[创建插件](/development/create-plugin.md)。

### 已有结果的渲染定制

已有图表或工具结果需要不同的样式和展示结构时，在对应插件的项目入口修改公开属性或 renderer。这里沿用原有数据协议；要新增一种业务事件或消息类型，另见[自定义 AG-UI 事件与消息渲染](/development/custom-ag-ui-events.md)。

例如，启用 `chart-message` 后，打开 `src/agent-ui/plugins/chart-message/index.tsx`。当前默认入口将 `chart` 消息交给 `CanonicalChartMessage`，可以完整改为：

```tsx
import './style.css';
import { CanonicalChartMessage, defineDataMessageUI } from '@za38.03/agent-ui-plugins';

export const chartMessageUI = defineDataMessageUI<unknown>({
  name: 'chart',
  render: props => (
    <CanonicalChartMessage
      {...props}
      formatValue={value => new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
      }).format(value)}
      styles={{ bar: { borderRadius: 4 } }}
    />
  ),
});
```

预期：有效图表的数值最多显示两位小数，条形圆角为 4px，数据和消息名称保持不变。数值格式采用浏览器语言；需随应用语言变化时，在自己的展示组件中读取统一 locale 并传给 `Intl.NumberFormat`。

| 属性                              | 用途                                               |
| ------------------------------- | ------------------------------------------------ |
| `formatValue(value, item)`      | 改变数值显示                                           |
| `renderItem(item, index, data)` | 替换一个数据项的内容                                       |
| `renderChart(data)`             | 替换整个有效图表的展示                                      |
| `className`、`style`、`title`     | 整体样式与显示标题                                        |
| `classNames`、`styles`           | caption、list、item、label、track、bar、value 等语义区域的样式 |

完整类型 `ChartMessageProps` 从同一个 Plugins 公开入口导入，字段说明见[图表插件](/plugins/chart-message.md)。保留 `style.css` 导入、原始消息数据和 `name: 'chart'`。

同目录 `definition.ts` 中已有的 `dataMessageUIs: [chartMessageUI]` 和 `Component: () => null` 继续保留，AppUIModel 中原来的消息插件实例也继续启用。消息 renderer 不需要新增布局位置；把它改成普通布局组件会丢失消息展示入口。

工具结果在对应 `plugins/<id>/index.tsx` 的现有 toolkit renderer 中修改。保留工具名、参数、运行状态、结果、`interaction` 配置和审批回调，先使用组件公开的样式、展开属性和组合接口，见[工具调用详情](/plugins/tool-fallback.md)。展示组件不执行后端工具，也不在历史回放时重执行业务操作。

修改后分别触发有数据、空数据、失败、流式更新和历史回放，确认展示更新且原交互保留。这些修改属于项目应用层，无需先接管官方实现。

## 5. 插件业务逻辑定制

本例点击“获取草稿”，请求业务接口，再填入当前空草稿。**不会自动发送消息。** 请求和填入逻辑都在下面的项目文件中完成。

### 业务请求与响应

示例约定 `POST /api/draft-template`，`Content-Type: application/json`：

```json
{ "threadId": "thread-123", "locale": "zh-CN" }
```

成功响应：

```json
{ "code": 0, "data": { "prompt": "请分析这张订单的配送情况。" } }
```

这是业务接口示例，不是内置后端地址。替换为自己的接口；普通浏览器请求不会继承 `Agent request` 的 headers。

### 请求适配器实现

新建 `services/draft-template.ts`，使用项目已有 `zod`：

```ts
import { z } from 'zod';
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const responseSchema = z.object({
  code: z.literal(0),
  data: z.object({ prompt: z.string().trim().min(1).max(2000) }),
});

export async function loadDraftTemplate(input: {
  threadId: string; locale: AgentUILocaleCode; signal: AbortSignal;
}): Promise<string> {
  const response = await fetch('/api/draft-template', {
    method: 'POST', credentials: 'include', signal: input.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId: input.threadId, locale: input.locale }),
  });
  if (!response.ok) throw new Error('DRAFT_TEMPLATE_REQUEST_FAILED');
  return responseSchema.parse(await response.json()).data.prompt;
}
```

请求体、业务成功码或返回字段不同时，就在这个文件改映射。已有 Axios、签名或登录凭据模块也在这里调用，继续传下 `signal`。不要把 HTTP 200 当成业务成功，更不要失败后返回一份假草稿。

### 业务按钮实现

新建 `plugins/composer/DraftTemplateAction.tsx`：

```tsx
import { useLayoutEffect, useRef, useState } from 'react';
import { useConversationComposer, useAgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { useAgentConversation, useAgentRun } from '@za38.03/agent-ui-runtime';
import { getProjectMessages } from '../../application/i18n/messages';
import { loadDraftTemplate } from '../../services/draft-template';

export function DraftTemplateAction({ maxLength = 2000 }: { maxLength?: number } = {}) {
  const composer = useConversationComposer();
  const conversation = useAgentConversation();
  const run = useAgentRun();
  const locale = useAgentUILocaleCode();
  const labels = getProjectMessages(locale).composerCustomization;
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'load' | 'limit' | null>(null);
  const blocked = composer.disabled || run.status === 'running' || run.status === 'awaiting-input';

  // 编辑草稿、改变运行状态或语言后，旧请求不能再覆盖输入框。
  useLayoutEffect(() => {
    active.current?.abort();
    active.current = null;
    setPending(false);
    setError(null);
    return () => { active.current?.abort(); active.current = null; };
  }, [composer.text, blocked, conversation.id, locale, maxLength]);

  async function load() {
    if (active.current || blocked || composer.text.length > 0) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(null);
    try {
      const text = await loadDraftTemplate({
        threadId: conversation.id, locale, signal: controller.signal,
      });
      if (!controller.signal.aborted && active.current === controller) {
        if (text.length > maxLength) setError('limit');
        else composer.setText(text);
      }
    } catch {
      if (!controller.signal.aborted && active.current === controller) setError('load');
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }

  return <div className="project-composer-tools" aria-busy={pending}>
    <button type="button" disabled={pending || blocked || composer.text.length > 0}
      onClick={() => { void load(); }}>
      {pending ? labels.loading : labels.load}
    </button>
    {pending && <button type="button" onClick={() => {
      active.current?.abort();
      active.current = null;
      setPending(false);
    }}>{labels.cancel}</button>}
    {error && <p role="alert" className="project-composer-notice">
      {error === 'limit' ? labels.tooLong : labels.failed}
    </p>}
  </div>;
}
```

只在点击后发请求，挂载或历史展示不会调用业务接口。已有草稿时禁用获取，用户输入、开始运行、切换会话／语言、取消或卸载后忽略迟到结果。`type="button"` 避免工具按钮触发表单提交。

### 输入区按钮集成

将第 3 节的 `plugins/composer/index.tsx` 完整更新为：

```tsx
import { ConversationComposerPlugin as Composer } from '@za38.03/agent-ui-plugins/composer';
import { useAgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { useAgentConversation } from '@za38.03/agent-ui-runtime';
import type { ComponentProps } from 'react';
import { getProjectMessages } from '../../application/i18n/messages';
import { DraftTemplateAction } from './DraftTemplateAction';
import './composer.css';

export function ConversationComposerPlugin(props: ComponentProps<typeof Composer>) {
  const conversation = useAgentConversation();
  const labels = getProjectMessages(useAgentUILocaleCode()).composerCustomization;
  return <div className="project-composer">
    <DraftTemplateAction key={conversation.id} />
    <Composer {...props}
      rows={3} maxLength={2000}
      className={['project-composer-form', props.className].filter(Boolean).join(' ')}
      inputProps={{ ...props.inputProps,
        minRows: 3, maxRows: 8,
        style: { ...props.inputProps?.style, fontSize: 16 },
      }}
    />
    <p className="project-composer-notice">{labels.hint}</p>
  </div>;
}
```

预期：工具条与提示出现在输入区附近；点击获取后填入草稿，再用原发送按钮发送。已有附件、引用、工具触发器和发送／停止插件继续由原 Slots 渲染。`key` 只让这一个业务按钮在切换会话时重置，不给整个 Agent 加 key 或重建会话。

### 回调扩展与默认行为

事件回调在 `index.tsx` 的 JSX 中传入，先调用已有回调，并检查 `event.defaultPrevented`。仅记录点击时不要调用 `preventDefault()`；确实替换当前入口的默认动作时才同步阻止默认行为，再执行自己的流程。

当前 `Composer onSubmit` 对应表单提交；默认发送按钮使用 Composer 的发送动作，带 endpoint 的工作流按钮使用独立发送入口。**只加 onSubmit 不能覆盖所有发送；只禁用发送按钮也不能代表 Enter 等入口已被校验。** 异步函数的 Promise 不会被 React 事件自动等待。本例不拦截发送，避免绕过原有附件、队列、审批与工作流路由。若业务要求统一发送前校验，需逐一确认所有发送入口及当前公开扩展点，不能自行重建消息链。

## 6. 跨插件业务能力共享

只有输入区使用的请求函数，保留在 `services/draft-template.ts` 即可；按钮的 pending/failed 使用局部状态。多个插件需要同一份可变状态时，才使用 Plugin Service。

下面可选扩展让 `submit-action` 的下拉框修改输入上限，`composer` 随之更新。它是前端输入约束，不代替后端限制；本例不截断已有草稿，也不修改 Agent 协议。

### 定义共享服务

新建 `services/composer-policy.ts`：

```ts
import type { UIPluginObservableService } from '@za38.03/agent-ui-plugins/contracts';

export const COMPOSER_POLICY = 'project.composer-policy';
export const DEFAULT_POLICY = Object.freeze({ maxLength: 2000 });
export interface ComposerPolicySnapshot { readonly maxLength: number }
export interface ComposerPolicyService extends UIPluginObservableService<ComposerPolicySnapshot> {
  setMaxLength(value: number): void;
  dispose(): void;
}

export function createComposerPolicy(): ComposerPolicyService {
  let snapshot: ComposerPolicySnapshot = DEFAULT_POLICY;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setMaxLength(value) {
      if (![1000, 2000].includes(value)) throw new Error('INVALID_COMPOSER_LIMIT');
      if (snapshot.maxLength === value) return;
      snapshot = { maxLength: value };
      for (const listener of listeners) listener();
    },
    dispose() { listeners.clear(); },
  };
}
```

### 输入区服务注册与清理

对于默认组件入口，`plugins/composer/definition.ts` 可以写为下面的完整定义。已有项目自定义 setup、服务或本地实现时，将新增部分合入原定义，保留现有组件引用和服务接线：

```ts
import implementation from '@za38.03/agent-ui-plugins/composer';
import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { COMPOSER_POLICY, createComposerPolicy } from '../../services/composer-policy';
import { ConversationComposerPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationComposerPlugin: UIPluginDefinition = {
  ...implementation,
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [],
  provides: [COMPOSER_POLICY],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup(context) {
    const cleanup = implementation.setup?.(context);
    const policy = createComposerPolicy();
    const unregister = context.services.provide(COMPOSER_POLICY, policy);
    return () => { unregister(); policy.dispose(); cleanup?.(); };
  },
  Component: ConversationComposerPlugin,
};
export default conversationComposerPlugin;
```

setup 同步返回清理函数，不写成 async。每个 Agent 内同名服务只放一个活动提供实例。不要创建文件顶层全局 store 让多个独立 Agent 串状态。服务声明使用字面量数组和常量，便于工具检查依赖；已有项目提供其他服务时，将它们明确保留在数组中，不用 `new Set()` 或动态计算生成声明。

### 输入区字数限制读取

在第 5 节 `plugins/composer/index.tsx` 的已有 Plugins 根入口导入中补上 `usePluginService`、`usePluginServiceSnapshot`，并新增：

```ts
import { COMPOSER_POLICY, DEFAULT_POLICY, type ComposerPolicyService } from '../../services/composer-policy';
```

在组件顶层读取服务，将 Composer 的 `maxLength={2000}` 改成 `maxLength={policy.maxLength}`，同时给业务按钮传入当前上限：

```ts
const service = usePluginService<ComposerPolicyService>(COMPOSER_POLICY);
const policy = usePluginServiceSnapshot(service, DEFAULT_POLICY);
```

```tsx
<DraftTemplateAction key={conversation.id} maxLength={policy.maxLength} />
```

提供方组件可以读取自己 provides 的服务，不需要再把同名服务加入 inject。状态未变时返回同一个 snapshot，fallback 也用稳定对象。

### 发送插件共享服务接入

更新 `plugins/submit-action/definition.ts`，保留已有字段并声明可选依赖。默认 npm 入口的完整定义为：

```ts
import implementation from '@za38.03/agent-ui-plugins/submit-action';
import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { COMPOSER_POLICY } from '../../services/composer-policy';
import { ConversationSubmitActionPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationSubmitActionPlugin: UIPluginDefinition = {
  ...implementation,
  manifest: parseUIPluginManifest(manifestJson),
  dataMessageUIs: [],
  optionalInject: [AGENT_UI_LOCALE_SERVICE, COMPOSER_POLICY],
  Component: ConversationSubmitActionPlugin,
};
export default conversationSubmitActionPlugin;
```

将默认 `plugins/submit-action/index.tsx` 改为：

```tsx
import { ConversationSubmitActionPlugin as SubmitAction } from '@za38.03/agent-ui-plugins/submit-action';
import { useAgentUILocaleCode, usePluginService, usePluginServiceSnapshot } from '@za38.03/agent-ui-plugins';
import type { ComponentProps } from 'react';
import { COMPOSER_POLICY, DEFAULT_POLICY, type ComposerPolicyService } from '../../services/composer-policy';
import { getProjectMessages } from '../../application/i18n/messages';
import '../composer/composer.css';

export function ConversationSubmitActionPlugin(props: ComponentProps<typeof SubmitAction>) {
  const service = usePluginService<ComposerPolicyService>(COMPOSER_POLICY);
  const policy = usePluginServiceSnapshot(service, DEFAULT_POLICY);
  const labels = getProjectMessages(useAgentUILocaleCode()).composerCustomization;
  return <div className="project-composer-tools">
    <select aria-label={labels.limit.replace('{count}', String(policy.maxLength))}
      value={policy.maxLength} disabled={!service}
      onChange={event => service?.setMaxLength(Number(event.currentTarget.value))}>
      {[1000, 2000].map(value => <option key={value} value={value}>
        {labels.limit.replace('{count}', String(value))}
      </option>)}
    </select>
    <SubmitAction {...props} />
  </div>;
}
```

可选依赖缺失时使用 2000 的 fallback，选择器禁用，发送／停止原样保留。服务是必需功能时使用 `inject` 并处理提供方不可用的产品行为；provides、inject、optionalInject 不能重复声明同一名字。

定义变化后，在项目根目录创建或运行已有的 `scripts/sync-agent-ui.mjs`：

```js
import { synchronizeAgentUIPluginRegistry } from '@za38.03/agent-ui-creator/project/dev';
const result = await synchronizeAgentUIPluginRegistry(process.cwd());
console.log(result);
```

```sh
node scripts/sync-agent-ui.mjs
```

这只是开发工具，不导入生产组件。保持 AppUIModel 中原来的 composer 和 submit-action 实例启用。预期：切换下拉值后默认输入框的 maxLength 更新，其他 Agent 不受影响；插件停用或卸载时清理服务和订阅。完整合同见[服务 API](/development/plugin-api.md#服务共享与状态订阅)。

本例接口最多返回 2000 字符，短档可能只允许 1000。第 5 节按钮会按传入上限检查长度，过长时显示本地化提示并保留原草稿，不截断业务文字。原生 maxLength 本身不覆盖所有程序写入和发送路径；业务后端仍独立校验。

## 7. 本地实现接管与定制

前面样式、业务请求、组件组合与服务修改都是项目应用代码，不要求源码接管。只有确需维护官方实现内部逻辑时，才进入本节。

### 源码接管范围

Creator 会先列出具体 Plugin、项目实际安装的版本、需要修改的文件、影响范围和验证方式。确认这份计划后，再将指定插件的实现提取到项目。下面的示例适用于已经完成 composer 接管的工程。

接管从项目**实际安装版本**提取 source，只切换应用入口的实现 import，保留原有 props、业务按钮、实例 ID、服务与 Slots。当前 composer 配方接管后的关键路径为：

```text
plugins/composer/
  index.tsx                 # 前面编写的项目应用层，保留
  definition.ts             # 原注册和业务服务，保留
  source/
    index.tsx               # 实现入口和 Slot 接线
    adapters/composer.tsx   # 输入区产品展示与交互适配
    adapters/textarea.tsx   # 默认输入展示适配
    presentation/           # 当前配方的展示依赖
    upstream/               # 原始参考源码与来源记录
```

实际完整文件清单以接管计划和已提取目录为准。已有项目沿用自己的目录，顺着本地实现的 import 找到要修改的组件。

### 示例：附件区域布局定制

假设已明确接管 composer，要把**内置附件预览**从输入区上方移到下方。在 `plugins/composer/source/adapters/composer.tsx` 的 `CanonicalComposer` 中，仅移动现有 `<ComposerAttachments />`，其他内容保持。当前代码位置的差异如下：

```diff
-            <ComposerAttachments />
             <ComposerAttachmentError />
@@
             </ComposerInputHostContext.Provider>
+            <ComposerAttachments />
             <div
               data-slot='aui_composer-actions'
```

在 `source/adapters/composer.tsx` 中移动现有的附件展示组件，保留其属性、原有 `renderSlot()` / `renderScopedSlot()` 调用及审批、队列逻辑。新增文案放入项目共享语言模块，接入方式见第 4 节。

接管后，在项目应用入口确认组件已引用这个本地实现，并保留原有 Plugin ID 和实例配置。后续定制保存到该插件的项目文件中。

### 后续升级

npm 升级保留项目应用层和本地实现，不自动把 source 升成新版。实现同步以 BASE／LOCAL／TARGET 合并，仅包含受管理的实现子树，验证后明确采用才推进 BASE；项目应用层、Shell 和业务服务不进入这个合并范围。公共 API 不兼容时，单独处理应用迁移，见[更新与源码维护](/development/source-takeover.md)。

## 8. 改动验证

沿用项目自己的包管理器和 `package.json` 中的 typecheck、test、build。修改公开入口不新增 UI 库或改变主版本；可选输入实现需要其自身依赖。Windows 中同样运行项目现有脚本，路径按实际目录填写，不使用 Bash 专用命令。

| 本教程修改  | 在真实页面检查                                               |
| ------ | ----------------------------------------------------- |
| 样式     | 默认输入框尺寸变化；light/dark/violet、窄屏、滚动和弹层正常                |
| 文案     | 中英文提示与按钮同时切换，无硬编码业务文案                                 |
| 获取草稿   | Network 中 URL、threadId、locale 与响应转换正确；写草稿后未自动请求 AG-UI |
| 失败与取消  | 失败可重试；取消、输入、切换会话／语言及卸载后不写回旧结果                         |
| 现有会话能力 | 附件、引用、Enter、发送按钮、停止、工具续传、审批、历史回放保持原语义                 |
| 共享服务   | 选择上限同步到默认输入；缺服务有 fallback；多个 Agent 状态隔离               |
| 本地实现排布 | 附件预览只出现一次；添加、移除、上传失败与历史展示正常                           |

### 常见问题

- **CSS 文件存在但不生效：**&#x68C0;查是否实际 import、className 是否传到目标元素、自定义 input 是否替代了默认组件，及生产样式入口是否保留。
- **新函数从来没有执行：**&#x521B;建 services 文件不会自动接入，检查组件导入和回调是否绑定到当前实例。
- **改输入框后附件或发送按钮消失：**&#x68C0;查是否漏了 `{...props}`，或覆盖了原 Slot 调用。
- **服务总是 undefined：**&#x68C0;查 definition 的 provides／依赖声明、提供实例是否启用，以及是否重新生成注册表。
- **读到状态但界面不更新：**&#x4F7F;用订阅 Hook，并在状态变化时返回新快照；不要原地修改对象或每次读取都创建对象。
- **旧结果跑进新会话：**&#x68C0;查请求的 signal、组件 key 与卸载清理；不要重用旧会话的异步回调。
- **升级后定制丢失：**&#x68C0;查是否改过 node_modules 或生成文件；项目应用层与已授权本地实现应独立维护。

类型检查证明接口签名，构建证明可编译；真实业务请求、取消、流式与视觉效果仍需在目标页面验证。完整接口查[插件 API](/development/plugin-api.md)，具体组件属性查[插件目录](/plugins/index.md)。
