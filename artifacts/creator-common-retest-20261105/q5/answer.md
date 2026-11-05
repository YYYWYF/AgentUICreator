我已拿到地址。先确认 `agent-identity` 实际公开的 props 名称，避免用错字段。头像地址已收到，`agent-identity` 的公开 props 确认含 `logo`（`string`）。现在改项目自有应用入口。静态校验已通过。再做一次运行时检查，确认身份条正常渲染、无本次改动引入的报错。头像已替换完成，改动落在项目自有应用入口，未触碰 npm 实现。

## 改动（1 个文件）

`/src/agent-ui/plugins/agent-identity/index.tsx`

```tsx
/** Agent 身份头像图片地址（项目自有配置点，可随时替换）。 */
const AGENT_LOGO_URL = 'http://127.0.0.1:47835/avatar.svg';

export function AgentIdentityPlugin({ logo, ...props }: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} logo={logo ?? AGENT_LOGO_URL} />;
}
```

- `logo` 是该组件公开支持的 prop（类型 `string`），所以只需传参，**无需接管 npm 实现**。
- 写法保留了外部覆盖优先（`logo ?? AGENT_LOGO_URL`）：若将来别处显式传 `logo`，仍以传入值为准，不破坏复用。
- 只影响「智能助手」身份条的头像（p20，右上角 280×52 区域）；其余 props 一律原样透传，名称、说明、插槽行为未变。

## 实际执行的校验

| 检查 | 结果 |
| --- | --- |
| `validate_creator_changes`（delta） | **passed**：`pnpm run typecheck` 退出码 0，新增错误 0，本地化默认值检查通过，Registry 已同步 |
| 运行时诊断（当前 hash `7b939420…`） | `currentErrors: []`，应用 `phase: ready` |
| 实时几何 | 身份条 p20 仍是 `x=712, 280×52`；历史会话 p21 `280×784`；会话区 712×836 —— 未塌陷、布局未被影响 |

## 我无法验证的一处（请你在页面确认）

**图片是否真的加载出来了**。实时观测只能给出矩形与结构，读不到 `<img>` 的 `src`，因此「显示的是你的图」这一步需要你肉眼确认。刷新预览后看右上角：

- 若显示你的图 → 完成。
- 若显示破图/空白，最可能是**混合内容被拦**：预览页若是 `https://`，浏览器会直接拦截 `http://127.0.0.1:47835/avatar.svg`。这种情况下最稳的做法是不依赖网络——把 SVG 内容以 `data:image/svg+xml;base64,…` 形式内嵌，我改同一行常量即可；也可以由你把该地址改成与页面同源或 https 提供商。
- 若图片被拉伸变形：该组件默认按容器填充，非正方形图需要我加 `logoProps={{ style: { objectFit: 'contain' } }}`。

另外说明边界：这条只改**身份条头像**。会话里每条助手回复旁的小头像由消息渲染实现提供，是另一个 seam，不在这个 `logo` prop 上；需要一起换的话告诉我，我单独确认它有没有公开入口。
