# 内网镜像兼容组合

本组合依据内网已成功执行 `pnpm install` / `pnpm dev` 的交接记录固定。
它保留 assistant-ui React 0.15.x 会话能力，同时兼容镜像中仅可用的
`@assistant-ui/react-markdown@0.14.6`。不代表所有上游 peer 声明均满足。

## 固定版本

| 依赖 | 版本 |
| --- | --- |
| `@assistant-ui/react` | 0.15.30 |
| `@assistant-ui/core` | 0.3.30 |
| `@assistant-ui/store` | 0.3.22 |
| `@assistant-ui/tap` | 0.9.24 |
| `assistant-stream` | 0.3.53 |
| `assistant-cloud` | 0.2.7 |
| `@assistant-ui/react-markdown` | 0.14.6 |
| `@assistant-ui/react-generative-ui` | 0.0.22 |
| `@assistant-ui/react-ag-ui` | 0.0.63 |
| `@assistant-ui/react-langgraph` | 0.14.29 |
| `@assistant-ui/react-lexical` | 0.2.15 |
| `lexical` / `@lexical/*` 编辑器依赖 | 0.51.0 |
| React / React DOM / React Test Renderer | 19.1.1 |
| `get-tsconfig` | 4.14.0 |
| `rolldown`（含对应平台绑定） | 1.2.9 |

根 `package.json` 的 `pnpm.overrides` 固定传递依赖。交接记录未逐项展开的
Vite 插件和类型包沿用本仓库已有精确版本；不声称已逐项验证它们在内网镜像上的可用性。
Host、Web Component、Lexical Source Item、测试 fixture 和升级目标同步声明版本。

## Markdown 兼容边界

- `@assistant-ui/react-markdown@0.14.6` 是当前内网组合的固定约束。兼容补丁直接落在
  `packages/plugins/src/shared/upstream/assistant-ui/components/assistant-ui/elements/markdown-text.tsx`，
  presentation adapter 从该兼容后的 upstream 副本生成；不能仅修改 presentation adapter，
  也不能通过关闭 upstream 类型检查来回避导入错误。
- 0.14.6 仅导出 `unstable_memoizeMarkdownComponents`，通过导入别名保留调用名
  `memoizeMarkdownComponents`；不修改实现或产品文案。
- 这是一项本次内网适配明确授权的 upstream 导入兼容例外。现有同步脚本只对固定
  Markdown 文件和版本重放该替换，导入锚点变化即失败。
- 保留原始 pinned upstream SHA/内容摘要，分别记录安装后的摘要和适配 ID
  `react-markdown-0.14.6-memoize-export`；presentation adapter 从同一来源生成。
  源码快照 revision 保持不变，npm package release revision 单独记录。
- 0.14.6 声明 `@assistant-ui/react: ^0.14.18`，与 0.15.30 存在已知 peer 冲突。
  隔离消费者安装按交接方案允许 peer 警告，使用相同 dependency overrides，仍检查
  真正发布 tarball 的声明，保持 `strict: true` / `skipLibCheck: false`。
  安装成功不能替代 Markdown 流式渲染、代码块和会话运行验证。

## 安装与验证

使用工程声明的 pnpm 8.12.0，并在运行前由使用者配置自己的 registry、认证和证书。
不把机构镜像地址或凭据提交到公共工程。

```text
pnpm install --frozen-lockfile
pnpm build
pnpm verify:dev-startup
```

锁文件已随版本计划更新。普通安装保留锁文件；无需因为切换 registry 就删除并重建。
`pnpm dev` 使用原有启动链路，仍包含包构建和隔离消费者检查。
消费者临时工程不会自动读取工程目录的 `.npmrc`；内网运行时需确保源配置对临时工程
也有效（例如用户级配置或环境配置）。

Windows 必须使用匹配架构的 Rolldown 1.2.9 原生绑定。锁文件包含 Windows x64 与 ARM64
条目不等于已在内网下载或运行成功；macOS 构建、进程辅助函数的 Windows fixture 和
本机 Chromium 检查也不能替代真实 Windows 验收。

升级 Markdown 时需重新审查版本组合、导入适配、来源记录、消费者 peer 策略和锁文件，
不能只删除兼容别名或只恢复 strict peer 参数。
