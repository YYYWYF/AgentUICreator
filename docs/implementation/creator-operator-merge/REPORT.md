# Creator / Operator 合包验证（2026-10-21）

## 结果与边界

Operator 不再是独立 workspace/npm 包，源码移动到 `packages/creator/operator`；原根目录 `contracts/` 移动到 `packages/creator/contracts`。公共 npm 包由七个变为六个，Creator 统一拥有开发工具版本、Operator 依赖、构建、声明、协议资源与发布。

Creator 的 Agent 编排、Python sidecar、UI 与 Operator 的工程检查、受控修改、校验、事务、接管、源码同步和更新规划仍为分开的内部模块。没有改变 wire 字段、操作授权、源码接管确认或 BASE 采用条件。生成前端仍独立于 Creator；Plugins 资源只由 Plugins 包分发。

入口迁移：

| 原入口 | Creator 包内入口 |
| --- | --- |
| `@za38.03/agent-ui-operator` | `@za38.03/agent-ui-creator/operator` |
| Operator `/dev`、`/protocol`、`/host`、`/resources`、`/updates`、`/commands` | Creator `/operator/dev` 等对应子路径 |
| Operator `/bootstrap` | Creator `/bootstrap` |
| Operator `/source-registry` | Creator `/source-registry` |

Operator 不保留第二份 package.json 或独立版本。构建先生成内部 Operator，再复制 runtime、声明、安装器及 presets 到 Creator 的 `dist/operator`，之后编译 Creator；这使首次 clean build 也可解析自身子路径。Python npm 资源与 wheel 从同一协议 owner 自动收集，安装后不依赖仓库路径。

更新中心使用真实 Creator 包身份，不再生成独立 Operator npm 更新目标。保留旧 `minimumOperatorVersion` 字段，约束统一工具版本；旧独立 Operator 包条目不是当前六包组合的合法目标。没有制作新的官方发行记录，也没有执行发布或用户工程升级。

同步调整了工作区/测试配置、CI 路径、发布校验与兼容清单生成、插件发布辅助脚本、生成测试工程及相关文档、AGENTS.md。已有工作区改动随文件移动保留，未提交、推送或发布。

## 已通过

环境：macOS，Node 24.20.0，使用仓库固定的 pnpm 8.12.0（`corepack pnpm`），现有 Creator Python 虚拟环境。

| 检查 | 结果 |
| --- | --- |
| `corepack pnpm install --frozen-lockfile --offline --ignore-scripts` | 通过，跳过重新解析 |
| `corepack pnpm --filter @za38.03/agent-ui-creator build` | 通过，含内部 Operator bundle/声明、Creator Node/UI、Python 与协议资源 |
| Creator `typecheck` | 通过，含 Creator、browser、Operator 实现及 Operator 测试类型检查 |
| `node scripts/check-operator-contract.mjs` | 通过，操作清单、双方 binding、Host execution 与模型工具权限一致 |
| `node scripts/check-dependency-pins.mjs` | 通过 |
| Operator 定向回归 | 48 passed：wire 合法/非法 fixtures 跨语言一致性、sourceRoot、兼容发现/单工具身份、构建完整性 |
| Creator 定向回归 | 25 passed：受管入口升级、工作区管理、更新 HTTP API、独立服务、准备回执 |
| Node 辅助检查 | 11 passed：六包归属、子路径、生产依赖边界、准备/复用、Windows 路径与 pnpm 调用 |
| Python 路径与调用核心回归 | 86 passed：source layout、Operator client/contract、project paths、sidebar contract |
| `node scripts/verify-public-packages.mjs` | 通过，真实六个 npm tarball 在空格/中文临时路径中独立解包消费 |
| `node scripts/verify-creator-package.mjs` | 通过，npm 协议字节一致性、已打包 Python sidecar 实际启动并健康检查/退出 |
| `node scripts/verify-creator-python-wheel.mjs` | 通过，wheel 协议字节一致性及隔离虚拟环境安装后初始化 validator |
| `git diff --check` | 通过 |

六 tarball 检查包括公开入口消费类型检查、真实工程初始化、执行生成的 `.agent-ui/operator/entry.mjs` 并验证成功响应，以及物理移除 Creator 后生成前端类型检查和生产构建。生产模块图不包含 Creator、Operator、Node catalog/source 工具资产。

额外对照任务开始前的工作树：82 份协议/fixture JSON 字节完全一致；锁文件中 525 条 registry package records 完全一致（含版本、依赖边、integrity 和平台条件），只调整 importer 与依赖归属。

## 未通过与未覆盖

没有宣称全仓库测试全绿，也没有逐项把扩展回归失败归为既有问题：

- Creator 完整 Vitest：436 passed、30 failed、3 skipped，14 个失败文件。涉及 Mock Demo/资源门禁、Mock 本地化与场景库存预期、旧 sidecar 集成等；没有在本次包归属迁移中重写这些产品行为或测试预期。
- Operator 扩展七文件回归：63 passed、16 failed。失败涉及 `package-upgrade.test.ts` 的真实 npm/pnpm fixture 命令返回 `PACKAGE_COMMAND_FAILED`、`compatibility-project.test.ts` 的依赖预检，以及旧 A2UI 资源依赖预期；未逐项复现迁移前基线，不据此声称它们全部早于迁移。
- Python 加入完整 contract fixtures 后：95 passed、1 failed。失败为 `test_operator_operation_receipt_and_host_fixtures_match_schemas`，旧 `fixtures/operator.json` 成功回执与 Schema 不匹配。已核对该 fixture 和 Schema 在任务开始前后字节完全一致，因此不是此次移动引入的协议改动。
- 三文件源码接管/交付补充回归（`official-package-pilot`、`plugin-source-takeover`、`general-plugin-delivery`）在输出 `context canceled` 后超过两分钟未完成，已停止本轮测试进程；不计为通过。期间修正了这三组测试中仍指向旧 Operator `node_modules` 的路径。
- Windows 做了 `path.win32` 空格/中文路径、生成入口根路径、presets 相对路径及 `.cmd`/`.exe` 参数模拟。没有 Windows 实机运行，不能据 macOS 检查宣称 Windows 实机验收完成。
- 未做新的 UI 视觉验收；此次修改是工具发布与文件归属，未修改产品展示文案或布局。

工作区在任务开始前已有大量未提交内容；本次未清理、提交或覆盖它们。临时基线与详细运行日志保留在本机 `/tmp/agent-ui-creator-merge-baseline/` 和 `/tmp/creator-merge-*.log`，不进入发布包。

## 合包复查与修复（2026-10-21）

用户确认 Web Component 继续独立发布。本轮复查发现并修复三处迁移遗漏：

1. `packages/web-component/scripts/prepare-shell.mjs` 原本仅准备 Core/Renderer/Plugins/Runtime，却读取 Creator 内部 Operator 中间产物，干净环境没有该产物。现改为准备完整 Creator，并通过公开 `/bootstrap`、`/operator/host` 导入；对应安装测试也使用公开入口。Web Component 的 build/typecheck 直接执行 Node 准备脚本，避免嵌套调用另一版本的 pnpm。没有合并 Web Component 包，也没有引入生产 Creator 依赖。
2. Plugins 构建中的服务元数据验证命令仍以 `../operator/...` 为工作目录相对参数，导致实际构建报 `ERR_MODULE_NOT_FOUND`。现通过 `fileURLToPath(new URL(..., import.meta.url))` 定位迁移后的脚本，使用原跨平台 pnpm helper 执行。
3. `official-form-fixture.test.ts` 中带模板变量的旧 Operator URL 没有迁移；现已修正，测试可以读到真实夹具，后续暴露出的内容不一致单独记录如下。

新增回归验证 Creator 构建失败时 Web Component 准备必须立即失败、不能绕过失败读取旧产物；同时验证内部 `operator/` 与已发布 `dist/operator/` 两种布局均可发现 Creator 包根目录、拒绝源码漂移和构建替换。准备回归已加入 workspace TS 门禁，Creator distribution CI 路径覆盖所有 workspace scripts。

本轮实际验证：

| 检查 | 结果 |
| --- | --- |
| `corepack pnpm --filter @za38.03/agent-ui-web-component build` | 通过完整 Core → Renderer → Plugins → Runtime → Creator → Web Component 构建链 |
| Runtime 构建中的消费端检查 | 真实 tarball 隔离安装、严格 peers、React 19.1.1、`skipLibCheck: false` 类型检查通过 |
| Creator `typecheck` | Creator、browser、Operator 实现及测试类型检查通过 |
| Operator 四文件定向回归 | 48 passed |
| Creator 五文件定向回归 | 25 passed |
| Node 准备/打包/路径/构建完整性检查 | 15 passed，含新增准备失败传播、两种 Operator 布局及 Windows 路径/命令模拟 |
| Web Component Vitest | 10 passed |
| Web Component 独立分发检查 | standalone/ESM 注册、无外部 import、Shadow CSS 检查通过；不是 UI 视觉验收 |
| `node scripts/verify-public-packages.mjs --strict-types` | 六个独立 tarball、全部公开子路径、严格消费类型、工程初始化、受管入口执行，以及移除 Creator 后的生产类型检查/构建通过 |
| 冻结离线安装、操作契约、依赖精确版本、`git diff --check` | 均通过 |

进一步定位了两项旧夹具问题，没有为了宣称通过而修改其内容或产品行为：

- Form 夹具测试在修正 URL 后因 `form-tool-contract.ts` hash 不一致而失败。重建合包前工作树后，确认旧夹具与当前夹具均为 `48024db3533e3c7781d707f8eb39b2a19ba70feac207795a5231b6776606e289`，对应资源文件为 `21f28c1dab0b3c88529e91fe6c54a3398121ca6211e777d55a67e20e48c9160d`，资源文件也与合包前字节相同。差异是夹具仍从 `@assistant-ui/react-hook-form` 导入，资源已使用 Plugins `/form-tools`。属于既有内容漂移，不是移动后的资源丢失。
- Web Component 安装测试已完成初始化、资源安装/幂等检查和生产者构建，但失败在“本地 Plugin 标记应进入 bundle”的断言。它试图替换旧 `return <ConversationComposerCommandTrigger source={source} labels={labels} />;`，当前薄层实际使用 `return <Implementation source={source} {...props} />;`，因此替换无效。对照合包前工作树确认该测试除入口 import 外未变，Plugin owner 没有因本次合包修改。未将整项安装测试计为通过，断言后的原生构建检查也未执行。

前文完整 Creator/Operator 扩展回归的其他失败本轮未全部逐项归因，仍不能宣称全仓库零回归。没有运行 Windows 实机或新增 UI 视觉验收；没有提交、推送或发布。
