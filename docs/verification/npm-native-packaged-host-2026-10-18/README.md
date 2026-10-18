# npm 原生发现和实际发布包新工程验证（2026-10-18）

## 实现

- Creator 默认使用 `NpmCompatibilityReleaseProvider`，在目标工程目录查询 npm latest 元数据，继承普通 npm registry / scope / 凭据设置，无需额外更新接口。既有显式 HTTP provider 仍兼容。
- `releases/compatibility.json` 是兼容组合和变更历史的维护入口。七个包 build / prepack 同步 `package.json.agentUI.compatibility` 与 `dist/compatibility.json`，并导出 `./compatibility.json`；缺失当前包版本或依赖要求漂移时阻止打包。
- 发现阶段校验真实包身份、兼容合同、不可变发行 ID；组合中的目标版本未全部发布时不推荐该组合。失败保留明确标记的缓存，不谎报最新。
- Plugins 的既有 catalog / portable snapshots 随包保留，源码同步仍以用户工程实际安装的版本为目标，不将在线 metadata 或 Creator 自身版本当成源码同步目标。

## 正式构建和检查

- 七个公开包正式构建：通过，详见 `public-build.log`。
- Runtime 严格独立消费者检查：React 19.1.1，实际 tgz，`skipLibCheck: false`，通过。
- 修复声明导入冲突、上游声明所需 Node 类型、裁剪后失效的推断声明引用、NodeNext 相对导入和应用层模板声明可移植性；未修改上游 vendor，未放宽消费者检查。
- npm provider、兼容选择、升级/恢复：3 个测试文件，31 项通过，详见 `update-regression.log`。发布同步保护测试 1 项通过，详见 `publisher-guard-tests.log`。
- tarball 核对：七包元数据与 payload 相同，无 workspace 依赖范围；Plugins 含 43 个插件/接管条目、706 个源码文件、58 项 Registry 资源，979 条源码/运行文件记录的哈希通过。详见 `packed-payloads.json`。

## 独立安装工程

实际工程：`/Users/yifei/Coding/agentui_test/npm-release-host`。

1. 在仓库外创建普通 React + Vite + TypeScript 工程；七个本次构建的实际 tgz 通过普通 npm 安装，487 个依赖安装成功，详见 `npm-install.log` / `archives.json` / `archive-hashes.json`。
2. `npm run creator` 调用安装包的 `agent-ui-creator --project . --port 4198 --no-open`，通过正式界面选择工作台，在 `src/agent-ui` 初始化。
3. Creator 正常进入 ready；Python 服务使用安装包 `dist/python` 和默认系统缓存 `packaged_venv`，未使用仓库 Python、测试 sidecar 或替换的 Python 路径。
4. `npm run build`（严格 tsc + Vite）成功，详见 `consumer-build.log`；`npm run dev` 页面正常渲染，见 `03-packaged-app.jpg`。生产入口仅导入生成工程的 Agent，Creator/Operator 为开发依赖。
5. 七个包真实路径均在该工程 node_modules 内，未链接工作区包。默认 `loadAgentUISourceRegistry()` 无参数读取 58 项资源，详见 `installed-identities.json`。
6. 正常 Creator 更新 API 返回 HTTP 200、安装版本 0.0.1、安装版源码 Release 0.0.1，详见 `default-update-check.json`。

没有配置本地 npm registry、更新清单 URL、workspace alias、overrides、pnpm hook 或测试 Host 服务。只在工具宿主的标准 `.env.creator.local` 配置真实模型凭据和既有模型会话 header；配置键名见 `consumer-boundary.json`，凭据不进入证据。前端的 `.env.development.local` 由官方初始化流程生成，是其默认开发配置。

## 验证边界

公开 npm registry 对七个包的 latest 查询仍全部返回 404，见 `public-npm-status.json`。因此本次验证的是正式构建、真实 tgz 安装、正常启动和源码读取，以及默认 npm 查询的诚实失败状态；不能将其描述为公开 npm 上已发布版本的在线升级验收。未向 npm 发布，也未伪造在线版本或搭建替代更新接口。

使用既有 Windows 包管理器调用 helper 和原生文件路径/URL 转换；发布同步测试包含中文和空格路径。没有 Windows 真机运行，本次 macOS 验证不等同于 Windows 验收。

未为本任务修改旧 fixture；并行插件清理任务的变更已等待其完成，再进行最终正式构建和安装验证。

## 真实模型边界

通过正式 Creator 页面提交了宽范围 Composer / 包内源码只读核对。真实模型成功执行了工程和文件检查，但直接读取 node_modules 被现有权限规则拦截，最后报告 `Minimal agent exceeded 12 model calls`，见 `04-model-discovery-limit.jpg`。这轮探查不计为完整源码接管/同步验收；没有更改权限、测试模型配置或伪造成功。包内源码存在及默认读取的结论来自上述实际安装包/Registry 核验。

限定文件的第二次真实模型请求通过：只读取 `/src/agent-ui/plugins/composer/index.tsx`，一次工具调用后明确回答它将 props 全量透传给 `@za38.03/agent-ui-plugins/composer`。见 `05-real-model-read-passed.jpg`。这证明标准安装、默认 Python 管理和真实模型读文件链路可用，不将其扩大为宽范围自主源码发现或完整合并验收。
