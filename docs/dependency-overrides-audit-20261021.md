# 依赖 overrides 审计（2026-10-21）

结论：移除根 package.json 中全部 16 项 overrides，无必须保留项；不升级或降级依赖。以下版本仍由当前直接声明或 pnpm-lock.yaml 精确锁定。审计依据是已安装包的原始 package.json、工作区声明和 pnpm 8.12.0 生成的 v6 lockfile，不依赖在线 latest 或内网镜像可用性。

| 原 override | 固定版本 | 决定及依据 |
| --- | --- | --- |
| @assistant-ui/core | 0.3.29 | 移除。Plugins/Runtime 已精确声明；react/ag-ui/langgraph 要求 ^0.3.29，hook-form 要求 ^0.3.20，现有版本均满足。 |
| react | 19.1.1 | 移除。Host/工作区安装声明已固定；已安装库的 React peer 范围均允许当前版本，没有需要强行替换的普通依赖。 |
| react-dom | 19.1.1 | 移除。Host 安装声明已固定；assistant-ui、Lexical、Base UI、Radix 等 peer 范围允许当前版本。 |
| react-test-renderer | 19.1.1 | 移除。四个工作区均以精确 devDependency 声明；没有上游普通依赖需要覆盖。 |
| @assistant-ui/store | 0.3.21 | 移除。Plugins 已精确声明；react/ag-ui/langgraph 要求 ^0.3.21，hook-form 要求 ^0.3.14；core/Lexical 的 peer 也允许当前版本。 |
| @assistant-ui/tap | 0.9.23 | 移除。react 普通依赖和 core/store peer 都要求 ^0.9.23，现有精确解析由锁文件保持；不为传递依赖新增无用途的根直接依赖。 |
| assistant-stream | 0.3.52 | 移除。Plugins 已精确声明；core/react/ag-ui/langgraph 要求 ^0.3.52，generative-ui 要求 ^0.3.46，cloud 要求 ^0.3.49，当前版本均满足。 |
| assistant-cloud | 0.2.7 | 移除。core/react 要求 ^0.2.7，langchain/langgraph 要求 *；锁文件仍唯一解析到 0.2.7。* 是上游声明，不会让冻结安装重新选择版本。 |
| @vitejs/plugin-react | 6.0.2 | 移除。八个工作区均精确声明；没有其他上游普通依赖需要覆盖。 |
| @vitejs/plugin-vue | 6.0.1 | 移除。两个 Vue Host 均精确声明；没有其他上游普通依赖需要覆盖。 |
| vue-tsc | 3.0.6 | 移除。两个 Vue Host 均精确声明；没有其他上游普通依赖需要覆盖。 |
| vue | 3.5.42 | 移除。两个 Vue Host 均精确声明；plugin-vue 的 ^3.2.25 和 generative-ui 的 ^3.5.0 peer 均满足。 |
| @types/semver | 7.7.1 | 移除。三个工作区已精确声明；没有其他上游普通依赖需要覆盖。 |
| @types/node | 26.6.2 | 移除。十一个工作区已精确声明；jsdom types 的 * 由锁文件固定，Vite/Vitest peer 范围均允许当前版本。 |
| tailwind-merge | 3.6.0 | 移除。Plugins 已精确声明；没有其他上游普通依赖需要覆盖。 |
| @types/jsdom | 28.0.3 | 移除。Plugins 已精确声明；没有其他上游普通依赖需要覆盖。 |

“移除”仅针对根 pnpm.overrides，不移除依赖本身。peerDependencyRules.allowedVersions 是独立的兼容例外，本次未扩大或修改。React 等发布包的 peerDependencies 仍表达消费者兼容范围，不把它们改成单一安装版本。

## 锁文件与验证边界

先在临时目录复制当前工作区 manifests 和锁文件，移除 overrides，再通过 pnpm 8.12.0 执行离线 lockfile-only 安装，明确允许该次同步锁文件；没有删除锁文件、没有使用 update、没有下载新包。应用前对比了完整 YAML 结构：

- 所有 15 个 importer 声明与解析完全一致。
- 所有 525 个包实例键保持一致，未增加或删除版本/peer 实例。
- 每个包的 resolution/integrity、依赖边、optionalDependencies、CPU/OS 等字段完全一致。
- 仅移除顶层 overrides，110 个包实例的 peerDependencies 恢复为上游原始范围。
- 16 个目标包仍各自只有一个锁定版本；Windows 原生包的版本和完整性记录保持不变。

工作区仍以 save-exact、精确版本守卫和默认 frozen-lockfile 防止漂移。以后显式升级时需审查 lockfile；不能以删除锁文件重新解析来代替锁定。

验证环境为 macOS、Node 24.20.0、pnpm 8.12.0：

- 实际执行 `pnpm install --offline --frozen-lockfile --strict-peer-dependencies` 成功，preinstall 精确版本守卫通过。
- 精确版本、工作区冻结安装和 Windows pnpm 调用相关 14 项 Node 测试通过。
- assistant-ui AG-UI、LangGraph 已安装兼容性检查和 AG-UI lockfile 检查通过。
- 完整 YAML 对比确认依赖图没有变化，`git diff --check` 通过。

未执行全仓库 build/typecheck/test，也未进行真实 Windows 安装或启动验收。这里的 Windows 证据仅为调用参数模拟及平台包锁定记录保持不变。
