# 真实 Creator 与真实模型 npm 更新完整验收

状态：2026-10-18 完整流程通过（Composer，临时 HTTP 注册源中的真实候选 npm 产物）。新凭据的最小请求返回 OK；凭据只更新在被 git 忽略的本机 Creator 配置中，没有写入验收材料。前序旧凭据 401 与仅 npm 验收材料保留为历史，最终证据以 `full-flow/verification.json` 为准。

## 实际流程与截图

1. 真实模型只改薄应用层，通过 rootProps.style 合并指定背景/内边距/圆角，未接管源码，Runtime 完成卡通过：`full-flow/04-props-visible-no-takeover.png`。
2. 为改变真实内部 DOM 顺序，Creator 出示原生接管确认卡；确认后提取当前安装 0.0.1 的 Composer，实现引用切为本地，模型把完整 actions 工具栏移至输入框上方：`06-real-takeover-question.png`、`07-user-approves-source.png`、`08-local-source-customization-visible.png`。
3. 更新页通过真实 HTTP 检查兼容组合和变更，核验实际 tgz 后展示 npm 计划；单独确认后执行真实 npm install、更新 package.json 和 package-lock.json，核验实际安装内容和工程检查：`09-online-update-discovery.png`、`10-verified-npm-upgrade-plan.png`、`11-user-confirmed-npm-installing.png`、`12-npm-installed-source-sync-available.png`。Plugins/Runtime 0.0.1→0.0.2；Core/Renderer 保持 0.0.1。未用解压替换模拟升级。
4. 升级后从工程实际安装的 Plugins 0.0.2 生成源码同步计划，检测真实冲突（requiresMerge=true）；由真实模型处理 BASE/LOCAL/TARGET：`13-source-sync-conflict-plan.png`、`14-real-model-merge-complete.png`。
5. 模型完成编辑后 BASE 仍保持旧版本，用户再于更新页确认验证并采用 0.0.2 基线：`15-merged-awaiting-validation.png`、`16-source-sync-complete.png`。
6. 最终预览中输入“保留应用层，合并新功能”，实时计数为 11；浅紫背景、12px padding、20px radius、工具栏位于输入框上方均保留：`17-final-composer-with-new-feature.png`。

## 核对结果

- 应用层与接管后原文本 SHA-256 相同；definition 引用、AppUIModel、Plugin/实例配置保持；模型只在实现 subtree 合并，没有推进 BASE 的权限。
- npm 升级后 BASE 与接管记录一致，完整同步另行确认后才采用 0.0.2。证据见 `npm-upgrade-proof.json`、`takeover-proof.json`、`conflict-proof.json` 和 `verification.json`。
- props、接管定制、模型源码合并三个阶段自动 Runtime 完成卡均为 changed-and-verified，runtime-verification passed。
- 最终实际工程 `verify:ui`、`typecheck`、`build` 全部通过，日志在 `full-flow/final-*.log`；最终浏览器 pageErrors 为空。Creator HTTP 请求记录（含中断续跑）及 source-only 合并请求分别保存。

## 宿主重启与验证边界

首次 fixture 在初始化时先链接候选源码目录、随后才真实 npm 安装；长进程 Node 的路径缓存仍指向初始链接，而新进程正确读取到已安装 0.0.2。npm 安装本身已成功。为避免把该缓存状态当作新版源码 TARGET，停止原 Python 工作区，在**同一个物理工程**重新启动 Creator 和预览宿主，未重装、复制或重置应用文件；随后更新页正常发现并完成源码同步。证据拆成前半程和 `resumed-live-session.json` 之后的后半程，未伪装成一次无重启的执行。新增 fixture 复用既有工程入口不会重新初始化或覆盖该工程。完整脚本后续应从初始化起使用真实安装，以免 fixture 链接迁移引入缓存。

兼容 Schema 的工具/项目安装树边界修正仍保留：开发工具的私有 Plugins 依赖不强制等于用户工程目标；项目内依赖、Creator→Operator 继续校验，生产包引用开发工具被拒绝。相关 26 项测试、Operator build/typecheck 通过，见本目录对应日志。旧 fixture 未修复。

候选 tgz 是实际构建打包的本地测试发行，不是公网正式发布。Runtime/Web Component 0.0.2 是跟随 Plugins 更新依赖声明的候选；第三方依赖采用已安装实际 payload 的 HTTP 测试镜像，Host Agent 数据沿用 fixture 端点，Creator 模型调用是真实外部服务。没有原生 Windows 验收。全七包构建在 Runtime 独立消费者类型检查处仍有 setImmediate、Collapsible、NodeNext 等错误，保留在 `full-package-build-incomplete.log`；本次 Host 构建通过不能替代该检查。
