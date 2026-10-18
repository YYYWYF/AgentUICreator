# 项目 npm 升级与源码同步验证

本轮覆盖独立项目的产物校验、确认后依赖/锁文件升级、失败恢复、用户文件保护和升级后的源码同步。

- 新增 Operator 测试启动临时 HTTP npm 注册源，生成真实 tgz，通过真实 npm 与 pnpm 安装 0.0.1 → 0.0.2，核对实际 node_modules、依赖声明和锁文件，并逐文件比对审核 tgz 与安装内容；没有用解压替换模拟安装。
- 覆盖 SRI 不符、安装文件被篡改、伪造/锁文件或用户文件变化的计划、workspace 阻塞、安装后失败恢复原锁和真实旧版本、恢复失败持久化并跨服务重试、并发用户修改保护、未知中断进程停止自动恢复。
- Composer 测试 tgz 包含当前构建后的官方 dist/catalog/source snapshots；测试包去掉第三方依赖声明以隔离注册源，**不是正式生产包发布验收**。生成带真实源码/runtime 摘要的新功能版本，通过 npm 安装后检查 application、LOCAL、AppUIModel、BASE 原样保留；再从已安装包生成 BASE/LOCAL/TARGET，确认冲突阻止自动合并，提交合并结果并通过 esbuild TSX 语法检查后采用新 BASE，保留应用层和本地注释定制。此聚焦检查不等同于完整 Host 编译或真实模型改写。
- Creator 测试验证 UI 先展示计划、单独确认执行、不会顺带源码 merge/adopt；恢复入口能在普通源码检查不可用时呈现。原有 HTTP 清单发现及源码接管/同步回归继续执行。
- Windows 静态 fixtures 覆盖 .cmd 与继承 npm-cli.js 路径解析（包括 Windows 路径在非 Windows 测试机的解析）。工程路径使用 native path 与 realpath，逻辑摘要路径使用 `/`；网络/文件 URL 不手拼。

本轮没有真实 Windows、真实 Creator/模型截图验收，没有发布 npm 包，没有修复旧 fixture。共享 workspace 锁、yarn/bun 执行、工具自升级与未知中断进程自动恢复仍需后续实现。

验证结果：Operator 3 个相关测试文件共 33 项通过；Creator 2 个相关测试文件共 10 项通过。Operator/Creator 构建及类型检查、`check:i18n` 与 `git diff --check` 通过。见本目录日志；未运行全仓旧 fixture。

Operator 实际 `npm pack --ignore-scripts` 输出中确认新公开更新服务、运行模块及类型声明均存在；打包元数据见 `packed-output.json`，没有发布到注册源。
