# 账号信息与退出登录（auth-account）

例如在侧栏底部显示用户名和头像，点击后打开账号菜单。直接传入业务用户资料时只显示身份；插件管理认证会话时，可提供退出登录。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![查看账号与退出登录（auth-account）界面示例](/images/plugins/auth-account.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable auth-account`，点击下图中的 **「查看账号与退出登录」**。

![Creator 启用菜单：点击「查看账号与退出登录」，插件 ID 为 auth-account](/images/plugins/enable/auth-account.jpg)

由开发者接好现有账号服务，配置登录和退出操作。用户查看当前账号并按业务登录流程操作。

## 使用前提

**登录、退出和会话刷新由业务认证服务实现**。用户资料仅用于展示，不能作为请求授权凭据。

## 定制选项

| 可以改什么   | 效果                     |
| ------- | ---------------------- |
| 账号名称和头像 | 展示业务页面提供的用户名和头像。       |
| 账号按钮    | 调整账号入口的大小、颜色和边框。       |
| 菜单位置    | 设置菜单从按钮哪一侧展开，以及与按钮的距离。 |
| 退出按钮    | 调整退出按钮的大小、颜色和圆角。       |
| 菜单和退出文字 | 修改“账号”“退出登录”等文字。       |
| 账号区域样式  | 调整这块区域的宽度和间距。          |

## 需求示例

```text
请修改「查看账号与退出登录（auth-account）」：
修改：账号菜单从【下方】展开，与按钮间距设为【8px】。
保留：当前用户资料和退出登录行为。
```

## 属性

打开项目中的 `plugins/auth-account/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalAuthAccountPlugin`；类型：`AuthAccountPluginProps`。继承 `div` 原生属性，排除 `children`。

| 属性                    | 类型                                                                     | 省略时 / 用途                                          |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| `signOutText?`        | `ReactNode`                                                            | 默认 `auth.signOut`                                 |
| `buttonProps?`        | `ComponentProps<typeof AgentUIPopoverTrigger>`                         | 账户菜单入口按钮                                          |
| `menuProps?`          | `ComponentProps<typeof AgentUIPopoverContent>`                         | 弹出菜单；默认在上方、末端对齐，偏移 10                             |
| `signOutButtonProps?` | `ComponentProps<typeof Button>`                                        | 退出按钮；`onClick` 中 `preventDefault()` 可阻止默认退出       |
| `hostUser?`           | [`AuthAccountUser \| null`](#authaccountuser)                          | 宿主页面提供的用户信息；只要传入此属性（包括 `null`），就显示该身份，不显示本插件的退出菜单 |
| `session?`            | `{ signOut(): Promise<void> }`                                         | 现有登录服务；退出操作调用它                                    |
| `snapshot?`           | [`{ user: AuthAccountUser \| null; busy: boolean }`](#authaccountuser) | 现有会话快照，单独使用组件时默认 `{ user: null, busy: false }`    |

未传 `hostUser` 时从 `snapshot.user` 读取；没有用户时显示未登录身份。

### 类型说明

#### AuthAccountUser

账号展示需要的身份字段，均可选。

```ts
interface AuthAccountUser {
  userId?: string; // 用户标识
  userName?: string; // 展示名称
  avatar?: string; // 头像 URL
}
```

### 类型查询

React 原生属性、组件组合及嵌套会话数据等复杂类型，可在编辑器中查询。通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalAuthAccountPlugin } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalAuthAccountPlugin>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
