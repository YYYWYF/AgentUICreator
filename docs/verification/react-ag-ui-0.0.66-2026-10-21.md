# react-ag-ui 0.0.66 回退验证（2026-10-21）

## 结果

已将 Runtime 的 `@assistant-ui/react-ag-ui` 从 `0.0.70` 回退并实际安装为 `0.0.66`，同步 pnpm 锁文件及 `assistant-ui-upgrade-target.json` 中该包的版本和 release commit（`d90bf230a319eb6ea285d98cda60eaad61428e8a`，通过官方 release tag 核对）。

**依赖及 Runtime 类型/构建检查通过，但没有达到“所有相关功能正常”的验收条件。** 原生 interrupt 在停止后丢失响应入口的上游缺陷已实测复现；Plugin 测试和 Host 构建还存在下述验证阻塞。保留用户要求的 0.0.66，不修改上游实现或绕过校验。

## 变更范围

- `packages/runtime/package.json`：只回退 react-ag-ui；React、Core、Store、AG-UI Client、LangGraph 等直接版本不变。
- `pnpm-lock.yaml`：react-ag-ui 解析为 0.0.66；其传递依赖 `@assistant-ui/generative-ui` 从 0.0.5 解析为 0.0.1（0.0.66 声明 `^0.0.1`）。其他无关依赖没有更新。
- `assistant-ui-upgrade-target.json`：仅该包版本及 `packageRevisions` 更新。全局 presentation revision 仍为原值。
- 新增 ON_INTERRUPT 的真实 HTTP/SSE 集成测试，新增原生 interrupt 取消问题的预期失败测试。
- 既有 vendored presentation、UPSTREAM 来源记录及之前的升级报告保留原历史身份，未假称其源码随依赖一起回退。

## 执行环境与检查

Windows，PowerShell，Node 23.11.1，pnpm 8.12.0。安装和验证通过仓库的 `scripts/pnpm-process.mjs` 处理 Windows pnpm 调用。首次安装完成；未运行 Python 或真实 Agent 后端测试。

| 检查 | 结果 |
| --- | --- |
| pnpm install --no-frozen-lockfile | 成功，安装包身份为 0.0.66 |
| check-assistant-ui-agui-compat.mjs | PASS：Client 0.0.59 满足 ^0.0.59 |
| check-ag-ui-lockfile.mjs | PASS：Client 唯一解析为 0.0.59 |
| check-assistant-ui-langgraph-compat.mjs | PASS：0.14.36 |
| packageManifestMismatches 对当前 target 检查 | 无不匹配项 |
| Runtime typecheck | PASS，包含新增测试 |
| prepare-host-packages.mjs | PASS：Core / Renderer / Plugins / Runtime / Operator 构建 |
| Runtime 隔离 tarball 消费者检查 | PASS：React 19.1.1、严格 peer 安装、skipLibCheck=false |
| Runtime 全量测试（最终稳定构建后重跑） | 21 个文件：19 通过、2 失败；141 项：137 通过、2 失败、2 预期失败 |
| Plugins 全量测试 | 140 个文件：48 通过、92 失败；执行到的 369 项：340 通过、29 失败；其余 suite 因初始化/导入等错误未执行 |
| Plugins typecheck | 失败：历史 locale-types 的 searchTools 缺少五个 context 字段 |
| build-workspace.mjs | Core / Renderer / Plugins / Runtime / Operator / Creator 构建成功；Host sandbox 初始化校验失败，后续 Host 未完成 |
| Web Component build | shell 初始化校验失败，未完成生产构建 |

## 功能结果

Runtime 全量测试覆盖附件、语音适配、反馈、前端工具、状态投影、并发会话、取消、历史/运行恢复及消息队列等。通过单元/集成测试不等于已完成浏览器视觉验收。

### ON_INTERRUPT：四种组合通过

`packages/runtime/tests/on-interrupt-command.test.tsx` 使用实际 `CancellationAwareHttpAgent`、Middleware、Runtime Provider 和 SSE 事件流，覆盖：

1. 正常结束后 approve。
2. 正常结束后 reject。
3. RUN_FINISHED 已到达、连接尚未关闭时 Stop，随后 approve。
4. 同样时序 Stop 后 reject。

每种组合均确认：审批请求保留、状态为 awaiting-input、等待期间普通消息被阻止、不支持的 edit 被拒绝且不发出新请求、下一次请求携带 `forwardedProps.command.decisions`、不携带原生 `resume`，处理后审批记录被清理。

测试验证命令的传输和前端状态；后端为模拟 SSE，不代表真实业务操作的允许/拒绝执行策略经过验收。没有人工点击页面按钮的视觉验收。

### 原生 AG-UI interrupt：正常恢复通过，Stop 边界失败

既有 question-interrupt 测试覆盖正常原生审批恢复。新增取消测试先验证 pending interrupt 为 `confirm-1`，再在流尚未关闭时调用公开的 `cancelRun()`。取消后实际 pending interrupts 为 `[]`，与预期保留 `confirm-1` 不符。

曾将该测试作为普通测试运行，确认失败点是取消后的 pending interrupt 断言（不是事件协议错误或等待超时）；随后以 `it.fails` 保留已知缺陷和期望契约。**预期失败不算功能正常。**

另一项预期失败来自既有 message-queue 测试：客户端工具接管期间已排队 follow-up 的保留时序。没有修复或隐藏该限制。

## 验证阻塞与限制

Runtime 两个普通失败：

- `public-api.test.ts` 仍只期望根导出，但实际清单还包含 `./compatibility.json`。
- `thread-list-binding.test.tsx` 的首个用例使用缺少 `use()` 的 Agent 替身，命令 Middleware 初始化抛出 `agent.use is not a function`。

扩大验证时还观察到：

- Windows fixture 创建 `@lexical/history` 等符号链接返回 EPERM，阻塞大量迁移集成 suite；不能据此断言这些功能通过或失败。
- Plugin 全量测试另有旧 presentation/来源匹配、locale、颜色断言、未找到 test suite 等失败。期间也执行过生产构建，涉及 dist 的少量导入失败不能当作稳定的产品缺陷结论；未将本次全量结果作为兼容性通过证明。
- `check-dependency-pins.mjs` 扫描历史 release 资源中的范围版本并失败；活动清单与当前 target 的版本匹配检查通过。
- Host sandbox 及 Web Component shell 初始化均报 `AGENT_UI_INITIALIZATION_VERIFICATION_FAILED` / `plugin-registry-entry`：`src/agent-ui/plugins/index.ts must only re-export the generated capability catalog.`
- 未在 0.0.70 上执行同样的全量对照，不能将所有失败归因于降级，也不能声称所有失败都已证明是原有问题。

遵守旧 fixture 修复不属于本次依赖回退的边界，没有顺带改写历史 fixture、locale 合同、Bootstrap 校验、UI 源码或系统符号链接权限。没有完成浏览器、真实后端或部署验收；整体 Windows 验收未通过。
