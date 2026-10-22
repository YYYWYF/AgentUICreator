# Dependency version policy and Windows setup

直接 dependencies、devDependencies、optionalDependencies 和当前 Source Registry 的 packages 使用精确版本；workspace 依赖使用 `workspace:*`，发布时转换为精确包版本。peerDependencies 中 React 等宽范围表示消费者兼容性，不负责选择安装版本。历史验收文件和历史 release fixtures 保留其原始记录。

`.npmrc` 的 `save-exact=true` 保证后续添加依赖默认保存精确版本，`frozen-lockfile=true` 使普通安装默认使用已提交的锁文件，拒绝静默重新解析依赖。根目录 `preinstall` 执行精确版本守卫，覆盖当前安装声明、overrides、测试工程和 Python 依赖；不改写历史 release 或上游源码。`pnpm check:dependency-pins` 检查当前包声明和生成项目的 Source Registry。完整传递依赖和平台二进制由提交的 `pnpm-lock.yaml` 锁定；复制项目时必须包含该文件，安装使用 `pnpm install --frozen-lockfile`，不要使用 update 或删除锁文件。

本次按公司版本固定 React / react-dom / react-test-renderer 19.1.1、TypeScript 7.0.2（根目录审计 alias 和 Vue 项目保留 5.9.3）、Vite 8.3.0、Vitest 4.1.8、AG-UI client/core 0.0.59、assistant-ui React 0.15.23、Lexical adapter 0.2.15、AG-UI adapter 0.0.63、LangGraph adapter 0.14.29、Markdown adapter 0.14.6、Hook Form adapter 0.12.34、Generative UI 0.0.22、core 0.3.27、Lexical 系列 0.51.0、Tailwind 4.3.3、zod 4.5.4、lucide-react 1.41.0。Generative UI 的历史 0.0.21 fixtures 不参与工作区安装。

core 0.3.27 官方依赖要求 assistant-stream ^0.3.50，以及 store ^0.3.19、tap ^0.9.23，因此 workspace override 同步锁定 assistant-stream 0.3.50、store 0.3.19、tap 0.9.23；公司镜像需提供这些版本。Markdown adapter 0.14.6 官方声明的 React adapter peer 为 ^0.14.18，与本次指定的 0.15.23 不匹配；构建/回归结果不能消除这个上游声明不一致。

## overrides 审计（2026-10-21）

已逐项移除根 package.json 的全部 16 项 overrides，无保留项。当前精确解析版本均满足上游原始要求；直接依赖已有精确声明，传递依赖和自动安装的 peers 由 pnpm-lock.yaml 锁定。冻结安装负责防止漂移，无需覆盖上游兼容范围。pnpm 离线同步后，525 个包实例、依赖边、integrity 和平台条件均未改变，仅移除 overrides 并恢复上游 peer 范围。下文旧环境记录中的 overrides 描述仅为历史记录。

## 当前依赖基线（2026-10-21）

上面的“本次按公司版本固定”和 2026-10-12 验证记录属于历史适配记录，不是当前安装版本清单。当前版本以各包 package.json、assistant-ui-upgrade-target.json 和 pnpm-lock.yaml 为准；本轮不采用内网降级组合，不升级或重解析依赖。工作区引用保留 workspace:*，peerDependencies 和 engines 保留兼容范围。

显式变更依赖后，使用固定的 pnpm 版本和 `pnpm install --lockfile-only --no-frozen-lockfile` 有控制地同步锁文件，审查差异后再执行冻结安装和相关验证。不要删除 lockfile 或为了固定传递依赖把它们全部提升为直接依赖。

## Windows PowerShell

以下为源码仓库开发步骤，需要本地 Python。已安装的 Creator npm 工具由平台依赖提供 Python，无需系统 Python 或 pip，不能将下文仓库引导步骤作为 npm 用户安装要求。分离构建/发布与平台验收见 [Creator Python 发行](../packages/creator/docs/python-distribution.md)。

最低支持 Node.js 20.19.0，锁定 pnpm 8.12.0；建议 Python 3.12。pnpm 11 不支持 Node 20，因此不用于当前启动流程。图片中的 Node 16.14.2 不适用：Vite 8.3.0 要求 Node ^20.19.0 或 >=22.12.0。项目放在可写目录，Git 和 Python 必须可通过 PATH 调用。

```powershell
node --version
pnpm --version
python --version
pnpm install --frozen-lockfile
pnpm check:dependency-pins
pnpm build
pnpm typecheck
pnpm test
pnpm verify:creator-distribution
```

安装不能把 macOS 的 node_modules 或 Python .venv 搬到 Windows；在 Windows 上按锁文件重新安装，以获取对应平台的原生二进制。公司 npm 镜像需包含完整锁文件依赖（不仅上表里的直接包），pip 镜像需包含 `packages/creator/python/requirements.lock` 中的依赖和 Windows wheels。通过本机 npm/pnpm 和 pip 配置设置公司镜像，不在仓库提交凭据。

从源码拷贝后，在根目录直接执行 `pnpm dev`；该入口自动冻结安装 JS 依赖、构建开发包、初始化平台 Host，并由 Creator 自动准备 Python 环境。UI 启动不需要模型密钥，发起真实模型请求前配置根目录 `.env.agentui.local`（参考 `.env.agentui.example`）。使用独立 sidecar 时，先运行 `pnpm test:python:setup`，再在一个 PowerShell 窗口执行 `pnpm creator:python`，另一个窗口执行 `pnpm dev`。`creator:python` 已使用 Node 跨平台入口，无需 Bash。模型/API 地址和凭据必须使用公司环境的可访问配置。

Creator distribution CI 已分离 Python 平台构建与 Node 验收任务，并覆盖 Windows x64、Linux glibc x64/arm64、macOS x64/arm64。各平台 CI 未实际执行时不能视作通过；本机 Windows 的 npm 安装/启动结果不代表其他平台。公司网络、镜像完整性和真实模型交互仍需在公司环境验收。

## 后续启动修复

默认 `pnpm dev` 已增加自动冻结安装；检测到其他平台/架构或 Node ABI 的 node_modules 时，会重建平台依赖。安装失败不会写入成功标记，也不会继续使用旧依赖启动。Python 的 Windows 自动引导兼容 `py` launcher；pnpm 调用兼容 JavaScript 入口和 standalone `pnpm.exe`。

公司指定 Markdown / React 和 Vite / esbuild 组合已通过构建、浏览器及对应回归验证，使用根 package.json 中仅针对这两组精确版本的 pnpm.peerDependencyRules.allowedVersions 声明本地兼容策略；其他非法 peers 仍可由 strict 检查拒绝。`pnpm install --frozen-lockfile --strict-peer-dependencies` 和 `pnpm peers check` 均通过，不修改 upstream 包。该设置的选择器语义见 [pnpm 官方 peer dependency 文档](https://pnpm.io/settings/peer-dependencies#peerdependencyrulesallowedversions)。

从不带 node_modules、dist、生成 Host、.env.agentui.local 或 Python .venv 的新源码目录（目录名包含空格），仅运行 `pnpm dev`，已自动完成 JS 安装、构建、Host 初始化与全新 Python 缓存创建，并启动 Host / Dock / sidecar。Windows 包命令及资源安装测试 18 项、Python 环境管理/解析测试 20 项、Node 启动测试 12 项通过。独立 Windows / Ubuntu 冷启动 CI 与 `pnpm verify:dev-startup` 已加入；本机实际执行环境仍是 macOS。

自动冷启动验收已执行通过：`pnpm verify:dev-startup` 对源码拷贝目录启动随机端口的 Host 与 Dock，确认 workspace ready、鉴权 Python proxy 返回预期 JSON 校验响应，并由 Chromium 验证两页内容、输入控件及无 pageerror；结束时停止本轮进程并清理独立 Python 缓存。该检查覆盖启动路径，不代替真实模型请求验收或所有历史单元测试门禁。

完整新源码构建还发现 assistant 示例未声明默认 Lexical Composer 的六项必需依赖；已补齐该 Host 的精确依赖声明（版本沿用公司清单），避免初始化依赖当前机器其他项目安装的包。

Node 20 compatibility verification (2026-10-12): Node 20.19.0 + pnpm 10.34.7 passed source-copy `pnpm dev`, Host/Creator HTTP readiness, Python proxy, Chromium rendering, and full `pnpm build` checks in a source-only temporary copy on macOS. Startup CI covers Node 20.19.0 and 24.20.0 on Windows/Linux. Node 20.0–20.18 remain unsupported with the company-pinned Vite 8.3.0.

pnpm 8 compatibility verification (2026-10-12): pnpm 8.12.0 + Node 20.19.0 passed fresh source-only `pnpm dev` bootstrap, Host/Creator readiness, Python proxy, Chromium rendering, strict frozen offline install, and full source-copy build on macOS. The v6 lockfile retains all importer resolutions, 501 package instances and integrity records; nested peer contexts use legacy opaque suffixes. Root `pnpm.overrides`, `pnpm.peerDependencyRules` and `pnpm.onlyBuiltDependencies` replace newer workspace settings; `.npmrc` enables pre/post scripts and exact saving. Windows/Linux startup CI now pins pnpm 8.12.0.

## Anthropic SDK 0.96.0 公司镜像兼容（2026-10-12）

Creator 的模型仍通过 `langchain-openai` / `ChatOpenAI` 使用 OpenAI Chat Completions 协议。Anthropic SDK 来自 DeepAgents 的强制传递依赖，不代表 Creator 会调用 Anthropic 服务。

锁定组合改为 `anthropic==0.96.0`、`langchain-anthropic==1.5.1`、`deepagents==0.6.12`，其他锁定依赖保留原版本。`pyproject.toml` 的 DeepAgents 声明同步为 `0.6.12`。上游元数据：[langchain-anthropic 1.5.1](https://pypi.org/pypi/langchain-anthropic/1.5.1/json)、[DeepAgents 0.6.12](https://pypi.org/pypi/deepagents/0.6.12/json)。公司镜像也必须提供这两个版本，不能只替换 SDK 或跳过依赖校验。

0.6 的 `create_deep_agent` 会追加自定义中间件，不能替代 0.7 的默认中间件；文件工具也没有 `tools=` 构造参数。`agent_ui_creator/deepagents_compat.py` 通过 DeepAgents 本身使用的 LangChain `create_agent` 编译 Creator 的显式中间件栈，保留上游 DeepAgentState、基础 prompt、Skills、PatchToolCalls、文件工具和现有产品权限/重试/诊断中间件。Creator 原本禁用的摘要、子 Agent、memory 和文件内容自动落盘继续禁用。没有修改第三方包或增加模型协议分支。Skills 后端从同一次读取补齐 0.6 缺少的分页元数据，保留已完整读取后的重复读取限制。

公司电脑同步以下六个文件（含新增模块）后，在 Git Bash 的仓库根目录停止旧服务并执行：

```bash
./packages/creator/python/.venv/Scripts/python.exe -m pip install -r packages/creator/python/requirements.lock
./packages/creator/python/.venv/Scripts/python.exe -m pip check
PYTHONPATH=./packages/creator/python ./packages/creator/python/.venv/Scripts/python.exe -c "import agent_ui_creator.server; print('Creator imports OK')"
pnpm dev
```

- `packages/creator/python/requirements.lock`
- `packages/creator/python/pyproject.toml`
- `packages/creator/python/agent_ui_creator/deepagents_compat.py`
- `packages/creator/python/agent_ui_creator/minimal_agent/agent.py`
- `packages/creator/python/agent_ui_creator/domain_agent/agent.py`
- `packages/creator/python/agent_ui_creator/domain_agent/skills.py`

验证在独立 macOS / Python 3.14 环境执行：完整锁定依赖安装、`pip check`、Creator 导入、sidecar 实际启动及鉴权 `/health` 200；280 项定向测试通过，包括四种 Creator 模式、OpenAI SSE 请求、文件读取/编辑、HITL checkpoint 暂停恢复、Skills 加载与分页、工具权限、重试与协议检查。另用 pip 针对 Windows x64 / Python 3.12 做全锁文件二进制依赖 dry-run，解析通过。没有完成 Windows 实机验收、公司镜像安装或真实模型服务调用。

此前在旧版本环境中也失败的 `test_model_factory` / `test_inspect_resume_permissions` 代表性用例仍有 9 项失败（无效测试项目配置及 selector fixture 缺少 task intent）；不计入上述 280 项通过，也未宣称全量 Python 门禁通过。重试顺序测试补齐了必需的 `.agent-ui/project.json` fixture。

## 公司补充版本锁定（2026-10-13）


## 编辑器与类型检查

首次安装依赖时会生成 Plugins 的 TypeScript 编写上下文；更新 `source-layout.json`、资源映射或交付清单后执行 `pnpm prepare:types`。`.typecheck/` 是由现有源码 owner 生成的类型解析目录，不提交、不发布，也不参与生产构建。它转发真实导出和服务类型，不声明宽泛的模块或跳过原始源码检查。

工作区根目录的 `tsconfig.json` 提供项目索引，各包测试目录也有自己的配置入口。VS Code 可使用工作区配置的 `typescript-ui-audit` SDK；命令行包检查仍使用固定的 TypeScript 7。`pnpm typecheck` 先准备公共包和 Web Component 声明，再串行检查全部包、Workbench、React/Vue/HTML 示例，避免消费者检查期间有另一个进程清理同一份构建输出。`pnpm test:types` 使用真实编辑器语言服务检查原始源码，并以错误类型和不存在的导出验证检查没有被放宽。编辑器若仍保留修改前的诊断，可重新加载 TypeScript 项目。
