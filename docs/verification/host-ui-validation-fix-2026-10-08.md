# 宿主 UI 识别后续修复记录（2026-10-08）

基线：`513321cd19c67c6dcfb17a57babcbceee8754041`。按本次最后指令“做完推送，不要验收”，只修复 Host 验证并运行必要的代码回归；真实 Creator 选型和视觉验收未执行，不声称方案中的完整产品验收标准已经满足。

## 修改与边界

- `packages/creator-python/agent_ui_creator/validation/command_runner.py`：仅允许 `verify:ui`、`typecheck`、`build` 三个既有验证脚本。读取目标 Host 的实际脚本声明，执行 `<manager> run <script>`，不使用 shell，不提供模型任意命令入口。
- 识别优先级沿用 Project Control 的 `ensure-resource-packages.ts`：有效 `packageManager` 声明、唯一 lockfile、显式 workspace 祖先。支持既有 npm/pnpm/yarn/bun。Python sidecar 不能直接调用该 TypeScript 私有 helper，因此在现有 validation 模块内对齐其识别行为；没有引入跨进程服务。与资源安装不同，验证不在缺乏证据时默认 npm。
- 缺失或空脚本、无包管理器证据、多个冲突 lockfile、不支持的声明、无效 package.json、启动失败和非零退出都保留明确失败证据。解析失败的回执显示 `<script> (not executed)`。
- `packages/creator-python/agent_ui_creator/validation/service.py`：baseline、开始日志、验证回执和缓存统一采用实际命令名称；保留 revision、delta/clean、失败归因以及 build 请求持续生效的原机制。既有 pnpm 字符串只保留为内部 allowlist 标识，不再决定执行器。
- `packages/creator-python/tests/test_validation_command_runner.py`：新增 20 项确定性回归测试。

此次提交不更改 assistant-ui vendor、官方插件 ownership、Runtime、Plugin 协议、组件库依赖或 UI Adapter。工作区原有未提交改动未纳入此次提交。

## 代码验证证据

运行：

```sh
PYTHONPATH=packages/creator-python packages/creator-python/.venv/bin/python -m pytest packages/creator-python/tests/test_validation_command_runner.py -q
```

结果：20 passed。npm 与 pnpm 测试没有 mock 进程，使用临时、无依赖的 Host package.json 和 Node 脚本，实际经包管理器执行。临时 Host 的脚本记录执行次数，build 可切换为真实非零退出；没有安装组件库或应用依赖。

| 包管理器 | 实际回执命令 | 结果 |
| --- | --- | --- |
| pnpm | `pnpm run verify:ui` / `pnpm run typecheck` / `pnpm run build` | 成功路径通过；失败 build 返回 failed |
| npm | `npm run verify:ui` / `npm run typecheck` / `npm run build` | 成功路径通过；失败 build 返回 failed |

两种 Host 均确认 baseline 先运行 typecheck，同 revision 复用成功/失败缓存，revision 更新后重新执行三个脚本，后续省略 includeBuild 也不会掩盖先前请求的 build 失败。另覆盖缺失 build、其他缺失/空脚本、lockfile、workspace、声明优先级、无法识别包管理器、不存在的执行器和非白名单命令。

`compileall` 与修改文件的 `git diff --check` 通过。

原有 `test_creator_validation.py` 与 `test_creator_validation_differential.py` 合计 20 passed、15 failed；在从 `513321c` 导出的独立源码副本中得到完全相同的 15 个失败测试名称及计数。历史问题包括 baseline 调用与旧 fake runner 期望不一致、fixture 缺少项目配置和失败归因预期不一致。本任务没有修复这些测试或更改归因策略。此前已记录的 `@agent-ui/plugins` 缺失、Composer 官方 ID 冲突及包入口解析失败没有纳入本次修复，也未运行完整 CI。

## 未执行的产品验收

下列所有场景均为未验证，没有模型执行日志、生成插件或视觉截图：

| 场景 | 待检查行为 |
| --- | --- |
| 自研 Button/Input | 读取真实导出、调用方和主题，生成插件引用宿主组件 |
| 宿主实际使用 Antd 5 | 使用已安装 API 和宿主 Provider |
| 已安装 Antd、实际使用自研 DS | 依据真实调用及封装选择 DS |
| 无合适组件库 | React 兼容时建议 Antd 5，安装前取得授权 |
| 拒绝安装 | 不增加依赖，沿用现有栈 |
| Vue | 保持 Web Components 桥接 |

后续真实 Creator 验收需逐场景保留 Host facts、源码读取工具记录、最终选择及理由、插件实际 imports、依赖 diff 和最终 revision 验证回执。不能用提示词检查、组件包名计数或模拟模型决策代替这些证据。

自研 DS 与 Antd 5 的桌面/窄容器、明亮/暗色、字体颜色圆角间距、Focus、Portal 和 assistant-ui/其他插件样式隔离均未验收。后续可沿用 Playwright 截图；本次没有运行浏览器，也没有宣称浏览器环境不可用。yarn/bun 仅验证命令解析，未实际执行这些包管理器。无依赖临时 Host 的脚本执行测试不证明真实插件的类型或构建兼容性。
