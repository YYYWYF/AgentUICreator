# 前端工具与自定义工具 UI

前端工具让 Agent 请求执行页面动作，例如打开弹窗或填写表单。业务应用决定哪些动作可用，并提供执行方法；工具 UI 只显示参数、状态和结果。

## 修改入口

在业务挂载文件（例如 `src/TicketPage.tsx`）创建工具并传给 `<Agent frontendTools={tools} />`。较大的实现可放在 `src/agent-ui/services/frontend-tools.ts`，从页面注入当前业务方法。工具声明和执行方法都写在这些项目文件中。

以下只支持主会话调用。后端业务工具展示使用 `toolkit`；允许 Agent 执行浏览器方法使用这里的 `frontendTools`，两者分别注册。

## 宿主页面操作接入

React 宿主可以从 `@za38.03/agent-ui-runtime` 导入 **`createAgentUIFrontendTools`**，把需要开放的页面方法交给 `<Agent frontendTools={tools} />`。这些操作与项目原有前端工具共同生效，不需要导入生成目录中的工具注册器。

```tsx
import { useMemo } from 'react';
import { AgentUIProvider, createAgentUIFrontendTools } from '@za38.03/agent-ui-runtime';
import { Agent } from './agent-ui';

export function TicketPage({ openTicket }: {
  openTicket: (id: string) => void;
}) {
  const tools = useMemo(() => createAgentUIFrontendTools([
    {
      name: 'open_ticket',
      description: '在当前页面打开指定工单',
      inputSchema: {
        type: 'object',
        properties: { ticketId: { type: 'string' } },
        required: ['ticketId'],
        additionalProperties: false,
      },
      execute(input, { signal }) {
        if (!input || typeof input !== 'object' ||
            !('ticketId' in input) || typeof input.ticketId !== 'string') {
          throw new Error('INVALID_TICKET_ID');
        }
        signal.throwIfAborted();
        openTicket(input.ticketId);
        return { opened: input.ticketId };
      },
    },
  ]), [openTicket]);

  return <AgentUIProvider><Agent endpoint="/api/agent" frontendTools={tools} /></AgentUIProvider>;
}
```

新初始化模板已接入 `frontendTools`。已有工程需要同步检查 `application/Agent.tsx` 的属性，以及 `frontendTools` 是否继续传给会话组件，仅升级 npm 依赖不会改写这个项目文件。

把 `./agent-ui` 改成项目实际的 Agent 入口。`openTicket` 连接宿主已有的业务方法；创建工具不会立即执行它，只有 Agent 发起该工具调用才执行。

| 字段                        | 用途                                                                  |
| ------------------------- | ------------------------------------------------------------------- |
| `name`                    | 后端可调用的工具名，使用小写字母开头的下划线格式，最多 64 个字符。                                 |
| `description`             | 向 Agent 说明该操作的用途。                                                   |
| `inputSchema`             | 向 Agent 声明参数的 JSON Schema，不代替宿主自己的数据与权限检查。                          |
| `execute(input, context)` | 执行业务操作。`input` 为 unknown，先校验再使用；context 提供 `signal` 和 `toolCallId`。 |

**异步方法把 `signal` 传给可取消的请求，并在更新页面前再次检查取消状态。** 返回字符串或可 JSON 序列化的数据，结果由原会话的工具执行链回传；抛出的错误会作为工具失败处理。已有操作不会因取消而自动撤销。

用 `useMemo` 保持工具来源稳定；页面方法变化时更新依赖。替换 `frontendTools` 或卸载 Agent 会取消该来源未完成的调用，并忽略迟到结果。被替换的回调如果没有配合 signal，已经开始的业务副作用仍需由宿主自行处理。

同名宿主工具与项目工具会明确报错，**不会覆盖已有工具**。只执行主会话的调用；历史展示不会触发页面操作。需要动态改变可用工具时，可自行实现 npm Core 导出的 `AgentFrontendToolSource`，通过 `subscribe` 和 `getRevision` 通知变化；仍使用相同的 `frontendTools` 属性接入。

## 选中城市后，让后续消息携带城市

用户让 Agent 打开选城工具，选中杭州后，再输入“明天天气怎么样”。把选中的城市保存到页面 state，并传给 `Agent.ctx`；发送按钮和回车发送都会使用更新后的值。

将下面代码放在 `src/CityPage.tsx`。`openCityPicker` 的完整实现见下一节；`./agent-ui` 换成项目实际入口。

```tsx
import { useMemo, useState } from 'react';
import { createAgentUIFrontendTools } from '@za38.03/agent-ui-runtime';
import { Agent } from './agent-ui';
import { openCityPicker } from './city-picker';

export function CityPage() {
  const [city, setCity] = useState<string | null>(null);
  const tools = useMemo(() => createAgentUIFrontendTools([
    {
      name: 'select_city',
      description: '打开选城界面，等待用户选择城市',
      inputSchema: {
        type: 'object', properties: {}, additionalProperties: false,
      },
      async execute(_input, { signal }) {
        const selected = await openCityPicker(signal);
        signal.throwIfAborted();
        if (selected === null) return { cancelled: true };

        setCity(selected);
        return { city: selected, cancelled: false };
      },
    },
  ]), []);

  return <Agent endpoint="/api/agent" frontendTools={tools} ctx={{ city }} />;
}
```

用户选中杭州后，下一次发送的请求包含 `"forwardedProps": { "ctx": { "city": "杭州" } }`，后端从 `input.forwardedProps.ctx.city` 读取。工具返回的 `{ city: '杭州' }` 是本次调用结果；`setCity()` 和 `Agent.ctx` 负责后续消息的参数，不需要修改 `submit-action/index.tsx`。

已有业务 store 时，工具更新 store，挂载 Agent 的页面订阅同一个值即可。这份 state 属于当前页面，切换 Thread 不会自动清空，刷新也不会自动恢复；按业务需要决定共享范围和持久化方式。更多参数用法见[传递业务参数](/development/business-context.md)。

## 等待用户选完城市，再让 Agent 继续

`execute()` 返回的 Promise 完成后，工具结果才会回传。把现有选城弹窗包装成 `Promise<string | null>`：确认时返回城市，用户取消时返回 `null`；运行被停止时通过 `AbortSignal` 关闭弹窗并拒绝 Promise。

下面是可直接配合上一节使用的 `src/city-picker.ts`，使用浏览器原生 `<dialog>`，无需新增 UI 依赖。已有弹窗组件时，可保留这个异步接口，用项目现有组件替换弹窗实现。

```ts
export function openCityPicker(signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = `
      <form method="dialog">
        <label>城市
          <select name="city">
            <option>杭州</option><option>上海</option><option>北京</option>
          </select>
        </label>
        <button value="confirm">确定</button>
        <button value="cancel">取消</button>
      </form>`;

    const cleanup = () => {
      signal.removeEventListener('abort', abort);
      dialog.remove();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('City selection aborted', 'AbortError'));
    };
    dialog.addEventListener('close', () => {
      const city = dialog.returnValue === 'confirm'
        ? dialog.querySelector<HTMLSelectElement>('select')!.value : null;
      cleanup();
      resolve(city);
    }, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
```

这段示例的城市名和按钮文字属于业务界面，实际使用时接入项目现有文案方案。弹窗打开后不要立即返回 `{ opened: true }`：那会让 Agent 只收到“已打开”，无法等待本次选择。

在上一节中，点击取消或按 Esc 会返回 `{ cancelled: true }`，保留之前选中的城市，Agent 可据此继续回复；点击停止则中止当前工具调用。关闭业务弹窗与停止 Agent 运行是两个独立动作，按业务约定处理即可。这里等待的是普通异步工具结果，后端审批或暂停恢复另见[人机交互与操作确认](/plugins/human-interaction.md)。

## 为选城工具显示专用结果卡片

如果希望在对话里显示选中的城市，可以通过 `frontendToolUIs` 按工具名配置展示组件。新建 `src/city-tool-ui.tsx`：

```tsx
import {
  useAgentUILocale,
  type ConversationToolCallProps,
} from '@za38.03/agent-ui-plugins';
import type { ConversationFrontendToolUIRegistry } from '@za38.03/agent-ui-runtime';

function CityToolUI({ result, status, isError }: ConversationToolCallProps) {
  const labels = useAgentUILocale('toolTimeline');
  const value = result && typeof result === 'object'
    ? result as Record<string, unknown> : {};
  const label = isError || status.type === 'incomplete' ? labels.failed
    : value.cancelled === true ? labels.cancelled
    : status.type === 'complete' ? labels.complete
    : status.type === 'requires-action' ? labels.waiting : labels.running;

  return <div>
    <span>{label}</span>
    {typeof value.city === 'string' && <strong> {value.city}</strong>}
  </div>;
}

export const cityToolUIs = {
  select_city: { display: 'standalone', render: CityToolUI },
} satisfies ConversationFrontendToolUIRegistry;
```

在上一节的 `CityPage.tsx` 导入它，并更新原来的 `<Agent />`。保留项目已有的工具展示注册，合并新增条目：

```tsx
import { cityToolUIs } from './city-tool-ui';
import { agentUIProject } from './agent-ui/application/project-config';

// CityPage 内，保留前面的 city 和 tools：
return <Agent
  endpoint="/api/agent"
  frontendTools={tools}
  ctx={{ city }}
  frontendToolUIs={{ ...agentUIProject.generatedFrontendToolUIs, ...cityToolUIs }}
/>;
```

已有额外的 Host 工具展示配置时，也合并进同一个对象；传入 `frontendToolUIs` 会替换项目默认配置，不会自动合并。`select_city` 必须与工具定义的 `name` 一致。

`display: 'standalone'` 使用独立展示位置，`'inline'` 使用行内展示；不设置时保留默认行为。组件可读取 `args`、`result`、`status`、`isError` 等[工具调用属性](/plugins/ask-user-question.md#当前工具调用的数据与操作)，示例状态文字复用 Agent UI locale。

`frontendTools` 决定工具能否执行，`frontendToolUIs` 负责展示。只注册 UI 不会把工具开放给 Agent；没有专用 UI 时使用默认工具展示。卡片只读取本次 `result`，历史里仍显示当时选中的城市；不要在渲染或挂载时调用 `openCityPicker()`、`setCity()` 或重新执行工具。

## AntD Form 直接接入

已有 AntD 表单可以直接把业务方法包装成前端工具。本例只开放填写姓名和邮箱；校验规则、用户点击保存及业务保存方法仍由原表单负责。无需安装表单专用集成、新增服务插件或修改布局 JSON。

沿用工程已安装的 AntD。以下使用 `Form.useForm()`、`setFieldsValue()` 和 `onFinish`；实际 API 以项目版本为准。将组件保存为业务页面文件（例如 `src/ProfilePage.tsx`），把 `./agent-ui` 改成实际生成入口：

```tsx
import { useMemo, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { createAgentUIFrontendTools } from '@za38.03/agent-ui-runtime';
import { Agent } from './agent-ui';

type Profile = { name: string; email: string };

export function ProfilePage({ saveProfile }: {
  saveProfile: (values: Profile) => Promise<void>;
}) {
  const [form] = Form.useForm<Profile>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'failed' | null>(null);

  const tools = useMemo(() => createAgentUIFrontendTools([
    {
      name: 'fill_profile',
      description: '填写当前页面的姓名和邮箱，由用户检查后点击保存',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
        additionalProperties: false,
      },
      execute(input, { signal }) {
        // Schema 声明供 Agent 使用；执行仍须校验真实输入。
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            !('name' in input) || typeof input.name !== 'string' ||
            !('email' in input) || typeof input.email !== 'string' ||
            Object.keys(input).some(key => key !== 'name' && key !== 'email')) {
          throw new Error('INVALID_PROFILE_INPUT');
        }
        signal.throwIfAborted();
        form.setFieldsValue({ name: input.name, email: input.email });
        setNotice(null);
        return { filled: true, saved: false };
      },
    },
  ]), [form]);

  async function onFinish(values: Profile) {
    setSaving(true);
    setNotice(null);
    try {
      await saveProfile(values);
      setNotice('saved');
    } catch {
      setNotice('failed');
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item name="name" label="姓名"
        rules={[{ required: true, whitespace: true, message: '请填写姓名' }]}>
        <Input disabled={saving} />
      </Form.Item>
      <Form.Item name="email" label="邮箱"
        rules={[
          { required: true, message: '请填写邮箱' },
          { type: 'email', message: '请填写有效邮箱' },
        ]}>
        <Input disabled={saving} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
      {notice && <Alert type={notice === 'saved' ? 'success' : 'error'}
        message={notice === 'saved' ? '已保存' : '保存失败，请重试'} />}
    </Form>
    <Agent endpoint="/api/agent" frontendTools={tools} />
  </>;
}
```

示例中文是业务页面文案，落地时使用项目已有的文案方案。Agent 插件内新增文案继续遵循[统一语言层](/development/localization.md#新增业务文案)。`saveProfile` 传入现有业务方法；例如在页面入口处理自己的 HTTP 协议，非成功响应需抛出错误，组件才会显示保存失败：

```tsx
<ProfilePage saveProfile={async values => {
  const response = await fetch('/api/profiles', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error('PROFILE_SAVE_FAILED');
}} />
```

这里的 `/api/profiles` 是示例业务接口，换成项目已有 URL、鉴权、成功码与错误处理。`/api/agent` 则提供标准 AG-UI 响应；后端需要理解本次请求中的 `fill_profile` 工具声明，按下节事件格式调用它，并处理工具结果后的继续运行。

用户说“把姓名填成张三，邮箱填成 [zhangsan@example.com](mailto:zhangsan@example.com)”后，Agent 可调用 `fill_profile({ name: '张三', email: 'zhangsan@example.com' })`。执行结果 `{ filled: true, saved: false }` 只说明字段已填入，未校验保存，也未调用业务 API。用户检查并点击保存后，AntD 校验成功才调用 `onFinish`；只有 `saveProfile` 完成后显示“已保存”。

`setFieldsValue()` 不会触发 `onValuesChange` / `onFieldsChange`。依赖这些回调的业务联动应提取为可复用业务方法，并由人工输入和工具入口分别调用。需要赋值后立即显示字段错误时，可在执行方法内显式等待 `form.validateFields(['name', 'email'])`，并把校验失败转换为清楚的工具结果。API 行为见 [AntD Form 官方文档](https://ant.design/components/form/)。

要让 Agent 重置或保存时，再按业务要求显式增加工具。保存工具应等待 `validateFields()` 和实际业务保存完成再返回；`form.submit()` 返回 void，不能将调用它直接当成保存完成。多个表单使用不同的业务工具名并绑定正确实例；日期、数字、上传等字段在各自 `execute` 中完成参数校验和转换。

### 检查 AntD 示例

1. 确认 AG-UI 请求的 `tools` 中有 `fill_profile`，没有自动新增提交工具。
2. 触发一次工具调用，姓名与邮箱各填入一次，继续请求中的工具结果是 `{ filled: true, saved: false }`；保存接口尚未被调用。
3. 用错误类型或额外字段调用工具，执行应失败，不能修改表单；打开已有工具记录也不能再次填表。
4. 填入无效邮箱后点击保存，应显示原表单校验错误，不能调用保存接口。
5. 修正邮箱并保存，核对实际请求内容与一次保存结果；再测试保存接口失败、错误提示及用户重试。
6. 在工程现有的类型检查和生产构建通过后检查真实页面。Mock 只能验证确定的协议链路，真实模型是否正确选工具仍需连接业务 Agent 检查。

验收时沿用项目已选择的 AntD 和兼容版本。用测试服务检查工具调用及表单保存，再连接真实 Agent，确认它能正确选择工具并使用执行结果。

## 工具调用与结果回传

上例工具声明随 AG-UI 请求的 `tools` 发送。后端选择执行时，在当前运行流中发出参数，例如：

```text
data: {"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"open_ticket"}

data: {"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{\"ticketId\":\"T-1042\"}"}

data: {"type":"TOOL_CALL_END","toolCallId":"call-1"}

```

运行仍需按 AG-UI 发送匹配的结束事件，完整外层格式见[AG-UI 数据](/plugins/ag-ui-data.md)。参数组装后交给 `execute()`，成功返回 `{ "opened": "T-1042" }`。现有工具链会序列化结果并续传给原会话，工具消息包含原 `toolCallId`；不要在 execute 中手工发送第二条聊天消息或再次创建 Agent。

## 业务接口调用

请求体／响应体由自己的业务 API 决定，适配就在 `execute()` 或它调用的项目服务函数里。假设业务先校验工单权限：`POST /api/tickets/check-access`，请求为 `{ "ticket_id": "T-1042" }`，响应为 `{ "allowed": true }`。将上例的 execute 替换为：

```ts
async execute(input, { signal }) {
  if (!input || typeof input !== 'object' ||
      !('ticketId' in input) || typeof input.ticketId !== 'string') {
    throw new Error('INVALID_TICKET_ID');
  }
  const response = await fetch('/api/tickets/check-access', {
    method: 'POST', signal, credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: input.ticketId }),
  });
  if (!response.ok) throw new Error('TICKET_ACCESS_CHECK_FAILED');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('allowed' in value) || value.allowed !== true) {
    throw new Error('TICKET_ACCESS_DENIED');
  }
  signal.throwIfAborted();
  openTicket(input.ticketId);
  return { opened: input.ticketId };
}
```

这是工具对象里的**方法片段**，与上面的 `name/inputSchema` 一起使用。输入 `ticketId` 先校验再映射为业务 `ticket_id`，响应检查后再改变页面。已有 Axios 等请求模块可放在这个位置调用，仍需传入 signal。前端检查不代替业务后端授权。

## 验证

检查工具声明出现在请求 tools，实际调用后有一次页面操作和对应工具结果续传。测试参数错误、接口失败、无权限、取消和重复调用；打开历史记录不得重执行业务操作。
