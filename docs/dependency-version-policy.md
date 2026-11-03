# 依赖版本与跨平台开发

当前依赖事实来自各包 package.json、pnpm-lock.yaml 和 assistant-ui-upgrade-target.json，不另维护一张历史版本表。公开 peerDependencies 表示消费者兼容范围，不代替完整安装验证。

工作区直接依赖与受控资源使用准确声明，workspace 引用保留 workspace:*。普通安装使用仓库固定的 pnpm 和冻结锁文件；变更依赖时审查声明、解析与锁文件差异，不删除锁文件或无条件重解析整个工程。执行相关版本守卫与消费者验证。

## 安装与 Windows

源码仓库的 Node 和 pnpm 要求读取根 package.json、.nvmrc 与当前 CI；Creator 发行要求见 [TypeScript 发行](../packages/creator/docs/typescript-distribution.md)。最终纯前端运行不依赖 Creator 或本机 Node，目标工程的开发/构建要求由其完整依赖决定。

不要跨平台复制 node_modules。Windows 按相同锁文件重新安装以获取本机原生依赖，确认包源、凭据与证书对项目和隔离消费者都有效。机构地址与凭据不进入公共源码。

使用已有跨平台进程 helper 和 scripts/pnpm-process.mjs。文件系统使用原生 path，资源/manifest 路径统一 /；文件 URL 使用 fileURLToPath/pathToFileURL。macOS 检查不能作为 Windows 实机验收。

## 编辑器与类型

执行 pnpm prepare:types 从 canonical owner 生成 Plugins 的编写上下文。.typecheck 是派生产物，不提交、不发布，也不参与生产 Runtime。

包检查和消费者检查沿用当前脚本；不通过宽泛模块声明、skipLibCheck 或关闭 upstream 检查掩盖真实 API 不兼容。依赖安装、类型、构建、浏览器和实际目标平台分别验证。
