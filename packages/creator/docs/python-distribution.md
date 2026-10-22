# Creator / Operator 工程与 Python 发行

用户只安装 `@za38.03/agent-ui-creator`，无需另行安装 Operator、系统 Python、pip 或 PyPI 包。生成的生产前端不依赖这些开发工具。

| 目录 | 内容 | npm 身份 |
| --- | --- | --- |
| `packages/creator` | Python Agent、skills、canonical contracts、轻量 Node 启动和兼容转发入口 | `@za38.03/agent-ui-creator` |
| `packages/operator` | TS CLI、UI、集成、进程宿主、项目操作与校验；项目控制模块位于 `control/` | `@za38.03/agent-ui-operator` |
| `packages/creator/platforms/<os>-<arch>` | CPython、锁定依赖、Agent、协议和许可 | `@za38.03/agent-ui-creator-<os>-<arch>` |

Creator 依赖 Operator，并通过 optionalDependencies 绑定精确平台版本；`workspace:*` 在 pnpm pack 时转为真实精确版本。Operator 不反向依赖 Creator。Creator 的 Node 入口提供自身安装目录；Operator 从该目录解析平台依赖，兼容 pnpm 的隔离依赖布局。

Creator 原有 `/vite`、`/ui`、`/dock/*`、`/operator/*`、`/bootstrap`、`/source-registry` 与 `/mock-agent` 导入路径保留为薄转发入口。TS 实现和浏览器资产只在 Operator 交付；Python 源码只有 `packages/creator/python/agent_ui_creator` 一个 owner。

## 分开的构建环境

Python 3.12+ 环境在匹配 OS/CPU 的机器上，从仓库根目录执行：

```text
python packages/creator/python/build_sidecar.py --output packages/creator/platforms/dist/artifacts
```

此脚本不执行 Node、npm 或 pnpm。它校验 `sidecar-platforms.json` 固定的 CPython 版本和 SHA-256，安装锁定 wheels，复制 Agent、contracts、skills 和许可，迁移至含空格/中文的目录后验证导入与子进程，再直接输出平台 npm `.tgz`。`sidecar.json` 记录身份、源码摘要和完整文件摘要。

离线构建可用 `--python-archive <path>` 提供匹配归档，并用 `PIP_NO_INDEX=1`、`PIP_FIND_LINKS` 提供完整 wheels；缓存位于 `packages/creator/platforms/dist/cache`。

把 `.tgz` 通过公司的构建产物存储交给 Node 环境，再执行：

```text
node scripts/restore-creator-sidecars.mjs 下载目录
pnpm install --frozen-lockfile
pnpm build:package
pnpm verify:creator-workbench --skip-build
pnpm verify:package
```

还原脚本默认处理当前平台，`--all` 处理全部声明平台；身份、源码/依赖锁/协议或文件摘要不匹配都会拒绝。Node 环境验证 Agent 时使用产物自带的 Python，无需配置系统 Python。

流水线与发布由维护者管理，本次调整不执行发布或修改流水线。先保证平台包和 Operator 的精确版本在目标 registry 可用，再发布 Creator。七个 API 包保持独立版本；`releases/compatibility.json` 仍需审查真实组合，不能使用 latest 或相同版本号替代兼容校验。

## 安装和验证

npm 按 os/cpu 自动选择平台包，不需要 postinstall、外部二进制下载或启动时 pip。平台包缺失、不支持、文件不全或版本/源码摘要不匹配时明确报错，不静默改用系统 Python。

平台定义覆盖 Windows x64、Linux glibc x64/arm64、macOS x64/arm64；不宣称支持 musl 或 Windows ARM64。每个平台仍需真实验收。Windows 使用 native extended-length paths 避免 pnpm 深层路径触发 Python 的 260 字符限制。

高级用户可配置 `pythonExecutable` / `CREATOR_PYTHON_EXECUTABLE`。源码开发保留 `.venv`、受管开发缓存和热重载，这些不是已安装 Creator 的默认启动过程。

`pnpm verify:creator-distribution` 验证真实 tarball、协议和清空 PATH 后启动/重启；`pnpm verify:creator-workbench --skip-build` 在仓库外只声明 Creator 后安装并验证 CLI/UI/Python；`pnpm verify:package` 验证公共 API、类型与独立前端生产构建。旧 Python 集成 fixture 的既有失败需要另行修复，拆包不放宽 Agent 权限、协议或完成校验。

`pnpm verify:creator-workbench --skip-build --npm` 使用全新 npm 缓存，在含空格/中文的仓库外目录执行普通 `npm install`，只声明 Creator，不覆盖依赖或手动安装 Operator/平台包。安装时 PATH 只提供 Node，运行 CLI 和独立 Python 启动/重启检查时 PATH 为空目录，并验证实际 Python 可执行文件来自自动安装的平台包、未创建开发期 Python 环境缓存。未发布的本项目包通过临时本地 registry 提供真实 tarball；第三方依赖仍从配置的 registry 下载。此检查是本机 OS/CPU 的安装验收，不代替其他平台或正式 registry 发布验收。

## 本次验证范围（2026-10-22）

Windows x64 已完成平台构建、Creator/Operator 类型检查、Workbench 类型检查、启动/路径单元测试、合同与 i18n 检查。仓库外消费者只声明 Creator，已验证自动安装 Operator/平台包、CLI/UI、清空 Python PATH 后启动和退出；真实 tarball 也已通过连续启动/重启。七个 API 包的独立消费、初始化和移除 Creator/Operator 后的生产构建通过。Linux/macOS 未在本机运行。

补充 npm 干净安装验收通过（Windows x64、Node 23.11.1、npm 10.9.2）：全新 npm 缓存，安装时只有 Node 可用，启动时 PATH 为空；CLI/网页资源、项目选择与初始化设置接口正常，自动安装的平台 Python 两次启动健康检查均为 200，并验证关闭后端口不可访问。没有手动安装 Operator、平台包或 Python，也没有 Python 环境引导。npm 仍提示既有 `@assistant-ui/react-markdown@0.14.6` 与 `@assistant-ui/react@0.15.30` 的 peer 范围冲突，以及 `nanoid@6.0.2` 不包含 Node 23 的 engine 告警；本次安装与启动通过不代表这些依赖告警已解决。

扩大回归未全绿：旧 `host-public-entry.integration.test.ts` 仍有四个初始化/应用层预期断言不匹配；`npm-release-provider.test.ts` 使用当前空的 reviewed compatibility history，无法得到其预期的已发布组合。额外的真实包安装/恢复大套件未完成；这些结果不能表示全量回归或正式发布验收通过。未为消除这些失败而补造正式兼容历史或改变 Agent/初始化行为。
