# 账号信息与退出登录（auth-account）

## 功能与效果

显示业务用户或认证服务中的身份，并复用现有退出流程。


### 账号展示


![账号展示界面](/images/plugins/auth-account.png)

**登录、退出和会话刷新由业务认证服务实现**。用户资料仅用于展示，不能作为请求授权凭据。

## 常见定制





### 业务用户资料 \{#由业务页面提供身份}


hostUser 传入用户时显示业务身份；显式传 null 表示当前无业务用户，不回退到插件身份。此模式不显示插件自己的退出菜单。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { CanonicalAuthAccountPlugin } from '@za38.03/agent-ui-plugins';

type Props = ComponentProps<typeof CanonicalAuthAccountPlugin>;
export function Example({ user, ...props }: Props & {
  user: { id: string; name: string; avatarUrl?: string } | null;
}) {
  return <CanonicalAuthAccountPlugin {...props} hostUser={user ? {
    userId: user.id, userName: user.name,
    ...(user.avatarUrl ? { avatar: user.avatarUrl } : {}),
  } : null} />;
}
```


### 账户菜单向右展开 \{#账户菜单向右展开}

只调整位置和大小，保留退出处理与已有用户快照。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { CanonicalAuthAccountPlugin } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalAuthAccountPlugin>) {
  return <CanonicalAuthAccountPlugin {...props}
    buttonProps={{ ...props.buttonProps, className: "project-account-trigger" }}
    menuProps={{ ...props.menuProps, side: "right", align: "start", sideOffset: 8 }} />;
}
```

### 读取当前登录用户 \{#读取当前登录用户}

组件与服务位于同一 Agent，并声明 `auth.session` 依赖。

```tsx fold height=180
import { useAuthSession } from '../../services/hooks/useAuthSession';

export function CurrentAccount() {
  const { serviceAvailable } = useAuthSession();
  const user = useAuthSession(state => state.user);
  return serviceAvailable && user ? <output>{user.userName}</output> : null;
}
```

相对导入以生成工程的 `plugins/<调用方>/index.tsx` 为起点；这些 `services/hooks` 文件由项目拥有，移动文件时同步调整路径。

## 属性与 API



### API

退出按钮文案在 `locales.auth.signOut` 中设置。触发按钮、菜单和退出按钮的属性不接受 `children`。

在 `CanonicalAuthAccountPlugin` 上设置以下属性。

继承 `div` 原生属性，排除 `children`。

| 属性                    | 类型                                                                     | 省略时 / 用途                                          |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| `buttonProps?`        | `Omit<ComponentProps<typeof AgentUIPopoverTrigger>, 'children'>`       | 账户菜单入口按钮                                          |
| `menuProps?`          | `Omit<ComponentProps<typeof AgentUIPopoverContent>, 'children'>`       | 弹出菜单；默认在上方、末端对齐，偏移 10                             |
| `signOutButtonProps?` | `Omit<ComponentProps<typeof Button>, 'children'>`                      | 退出按钮；`onClick` 中 `preventDefault()` 可阻止默认退出       |
| `hostUser?`           | [`AuthAccountUser \| null`](#authaccountuser)                          | 宿主页面提供的用户信息；只要传入此属性（包括 `null`），就显示该身份，不显示本插件的退出菜单 |
| `session?`            | `{ signOut(): Promise<void> }`                                         | 现有登录服务；退出操作调用它                                    |
| `snapshot?`           | [`{ user: AuthAccountUser \| null; busy: boolean }`](#authaccountuser) | 现有会话快照，单独使用组件时默认 `{ user: null, busy: false }`    |

未传 `hostUser` 时从 `snapshot.user` 读取；没有用户时显示未登录身份。

#### 将业务用户资料显示在账号区 \{#authaccountuser}

`hostUser` 和 `snapshot.user` 接受 `{ userId?: string; userName?: string; avatar?: string }`。`userName` 是展示名称，`avatar` 是头像 URL，`userId` 用于关联业务用户；这些展示字段不提供请求凭据。

业务系统字段不同时，按前面的[身份映射示例](#example-1)转换。`hostUser={null}` 明确表示没有业务用户，并关闭插件自己的退出菜单；省略 `hostUser` 才会读取认证服务快照，退出仍调用现有 `session.signOut()`。


业务卡片需要当前用户 ID 或姓名时，从项目 `services/hooks/useAuthSession` 导入 `useAuthSession`。`useAuthSession(state => state.user)` 按需订阅用户；无参数返回 `getSnapshot()`、`subscribe()`、`session` 和 `serviceAvailable`，不自动订阅数据。快照的 `user` 在未登录时为 `null`，已登录时包含 `userId`、`userName` 和可选 `avatar`。

对应功能示例读取同一份用户资料。它不会发起登录请求，账号变化后会自动更新；业务接口的鉴权仍沿用项目请求配置。服务方法见[认证服务](/plugins/auth-gate.md#服务)。

#### 服务方法 \{#服务}

消费可选的 `auth.session`；服务缺失时沿用已有 Host 用户展示。服务方法及类型见 [登录认证](/plugins/auth-gate.md#服务)。


## 常见问题

### 为什么设置 hostUser 后没有退出菜单？ \{#为什么设置-hostuser-后没有退出菜单}

该模式把身份和退出流程交给业务 Host。业务页面提供自己的退出入口；需要插件登录服务的退出菜单时省略 hostUser。
