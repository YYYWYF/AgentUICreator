# 搜索候选与命令来源

`@` 可以查询自己的员工、文档或业务对象；`/` 可以显示项目命令。两者通过来源对象接入，没有内置的通用搜索 URL 或命令 URL 配置。

以下路径以 `src/agent-ui/` 为源码目录。先在项目中启用 `mention-trigger` 或 `slash-command-trigger`；`/` 的默认命令注册通常由 `conversation-command-source` 提供。已有同类来源时修改原实现，避免重复提供同名服务。

## 1. @ 搜索来源接入

新建 `src/agent-ui/services/employee-mentions.ts`。本例业务接口为 `GET /api/employees?q=关键词`，没有请求体，成功返回：

```json
{
  "items": [
    { "id": "employee_84721", "name": "张三", "department": "产品部" }
  ]
}
```

没有结果返回 `{ "items": [] }`；失败用失败 HTTP 状态。适配器在 `search()` 中将业务字段转换为 `id/type/label/description`：

```ts
import { z } from 'zod';
import type { ConversationMentionSource } from '@za38.03/agent-ui-plugins';

const responseSchema = z.object({ items: z.array(z.object({
  id: z.string().min(1), name: z.string().min(1), department: z.string(),
})) });

export function createEmployeeMentionSource(identityRevision: string): ConversationMentionSource {
  return {
    cacheKey: identityRevision,
    async search({ query, signal }) {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/employees?${params}`, {
        signal, credentials: 'include',
      });
      if (!response.ok) throw new Error('EMPLOYEE_SEARCH_FAILED');
      return responseSchema.parse(await response.json()).items.map(item => ({
        id: item.id,
        type: 'user',
        label: item.name,
        description: item.department,
      }));
    },
  };
}
```

`type: 'user'` 是这个例子的业务引用类型，需与自己的 Agent 后端约定。其他领域可以使用双方约定的类型。`id` 使用稳定业务 ID，不能只返回姓名。输入框会保留结构化引用，后端需按引用类型和 ID 处理；显示姓名不会自动让 Agent 获得员工资料。

接口若要求 POST、其他字段或业务成功码，就在 `search()` 内改请求和 Schema／映射。现有请求模块也在这里调用，保留 `signal`；错误抛出以显示失败和重试，只有真实无结果才返回空数组。

## 2. 提及组件来源配置

打开 `src/agent-ui/plugins/mention-trigger/index.tsx`。保留已有组件、props 和其他接线，在已有展示组件上设置 `source`。固定当前身份的简例为：

```tsx
import { CanonicalConversationMentionTrigger as Implementation } from '@za38.03/agent-ui-plugins';
import type { ComponentProps } from 'react';
import { createEmployeeMentionSource } from '../../services/employee-mentions';

const employeeSource = createEmployeeMentionSource('employee-search:v1');

export function ConversationMentionTrigger(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} source={employeeSource} debounceMs={250} />;
}
```

项目已有 `conversation.mention-source` 服务提供方时，优先修改它提供的来源，保留组件的 `usePluginService(...)` 接线；无需再在组件中创建第二份。

`cacheKey` 表示当前身份、语言、权限或数据版本。上面的固定值只适合身份不变的示例。实际项目在账号／权限／语言变化时，用当前身份信息创建新来源（例如通过 Hook + `useMemo`），或更新 `cacheKey` 并通过可选 `subscribe()` 通知。Token 由请求模块读取；不要放进 cacheKey。

## 3. / 命令来源接入

`ConversationSlashCommandSource` 通过同步的 `getSnapshot()` 返回当前命令，并用 `subscribe()` 通知变化。异步接口应先加载，再更新来源；不要让 `getSnapshot()` 返回 Promise。

项目已有 `services/composer-triggers.ts` 的 `createConversationCommandRegistry()` 和 `plugins/conversation-command-source/definition.ts` 时，保留默认“新建会话”的注册与清理，在它的 `setup` 内增加业务命令。下面演示从接口加载**指令引用**，没有自动发送行为。

业务接口示例：`GET /api/assistant/commands`，无请求体，返回双语菜单文案：

```json
{
  "commands": [
    { "id": "summarize", "labels": { "zh-CN": "总结", "en-US": "Summarize" } }
  ]
}
```

新建 `src/agent-ui/services/remote-commands.ts`：

```ts
import { z } from 'zod';
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import type { ConversationCommandRegistry } from './composer-triggers';

const responseSchema = z.object({ commands: z.array(z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  labels: z.object({ 'zh-CN': z.string().min(1), 'en-US': z.string().min(1) }),
})) });

export async function loadRemoteCommands(
  registry: ConversationCommandRegistry,
  locale: AgentUILocaleCode,
  signal: AbortSignal,
): Promise<() => void> {
  const response = await fetch('/api/assistant/commands', { signal, credentials: 'include' });
  if (!response.ok) throw new Error('COMMANDS_LOAD_FAILED');
  const { commands } = responseSchema.parse(await response.json());
  signal.throwIfAborted();
  const existing = new Set(registry.getSnapshot().map(item => item.id));
  for (const command of commands) {
    if (existing.has(command.id)) throw new Error('COMMAND_ID_CONFLICT');
    existing.add(command.id);
  }
  const remove = commands.map(command => registry.register({
    id: command.id, label: command.labels[locale], mode: 'directive',
  }));
  return () => remove.forEach(dispose => dispose());
}
```

在 `plugins/conversation-command-source/definition.ts` 顶部导入这个函数，并在已有 `setup` **创建 source、注册默认命令之后**加入：

```ts
// setup 内局部片段，source 是该文件已有的命令注册器。
const controller = new AbortController();
let removeRemote: (() => void) | undefined;
const code = locale?.getSnapshot().locale ?? 'zh-CN';
void loadRemoteCommands(source, code, controller.signal).then(remove => {
  if (controller.signal.aborted) remove();
  else removeRemote = remove;
}).catch(error => {
  if (!controller.signal.aborted) console.error('COMMANDS_LOAD_FAILED', error);
});
```

在该 `setup` **已有的返回清理函数内**补上 `controller.abort()` 和 `removeRemote?.()`，保留原有 locale 订阅、默认命令的清理。需要切换语言或账号时重新加载，用相同模式先取消旧请求、移除旧业务注册；失败交给项目的本地化提示与日志。

## 4. 命令选择行为

| 模式                  | 选择后的行为                             | 代码位置                                 |
| ------------------- | ---------------------------------- | ------------------------------------ |
| `mode: 'directive'` | 向草稿插入指令引用，发送后由 Agent 后端解释指令 ID     | 来源对象中的命令记录；上例采用此方式                   |
| `mode: 'action'`    | 调用本地 `execute()`，可为 void 或 Promise | 在项目来源实现中编写 execute；按需调用已有页面方法／业务 API |

服务端不能用 JSON 传回可执行函数。远程菜单若要触发动作，项目代码应明确维护允许的命令 ID 与执行方法映射。纯文字填入草稿也属于 action，使用当前 Composer 的 `setText()`，不要把 directive 当成文字模板。公开输入能力见[会话组件与输入](/development/plugin-api.md#复用会话组件与输入能力)。

## 5. 验证

`@` 检查查询词、取消旧请求、空列表、错误重试、选择后的稳定 ID 和实际发送；账号／权限改变后不能复用旧候选。`/` 检查默认命令仍在、无重复 ID、语言切换和卸载清理；选择 directive 不自动发送，历史展示不执行 action。
