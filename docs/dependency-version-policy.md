# 依赖版本与跨平台开发

当前依赖事实来自各包 package.json、pnpm-lock.yaml 和 assistant-ui-upgrade-target.json，不另维护一张历史版本表。公开 peerDependencies 表示消费者兼容范围，不代替完整安装验证。

工作区直接依赖与受控资源使用准确声明，workspace 引用保留 workspace:*。普通安装使用仓库固定的 pnpm 和冻结锁文件；变更依赖时审查声明、解析与锁文件差异，不删除锁文件或无条件重解析整个工程。执行相关版本守卫与消费者验证。

## 安装与 Windows

源码仓库的 Node 和 pnpm 要求读取根 package.json、.nvmrc 与当前 CI；Creator 发行要求见 [TypeScript 发行](../packages/creator/docs/typescript-distribution.md)。最终纯前端运行不依赖 Creator 或本机 Node，目标工程的开发/构建要求由其完整依赖决定。

当前 Creator 与源码仓库支持 Node.js `^22.0.0 || ^24.22.1`，最低版本为 `22.0.0`；`.nvmrc` 固定该最低版本。CI 在 Windows/Linux 上配置 Node `22.0.0` 和 `24.22.1`，统一使用 pnpm 8.12.0。CI 配置不代替实际执行结果；本地 macOS 验证不能作为 Windows/Linux 实机验收。

工作区的构建组合为 Vite 6.4.5、React 插件 4.7.0、Vue 插件 5.2.4 与测试用 jsdom 26.1.0。Creator 的可选 Vite peer 接受 `^6.4.5 || >=8`；使用其他受支持的 Vite 版本时，还需满足该宿主工具链自身的 Node 要求。构建参数沿用 Rollup API，开发宿主固定 React 去重并提前预构建 Creator 的按需依赖，保持冷启动和热更新的 React 实例一致。此选择不改变生成项目对 UI Library 的所有权。

不要跨平台复制 node_modules。Windows 按相同锁文件重新安装以获取本机原生依赖，确认包源、凭据与证书对项目和隔离消费者都有效。机构地址与凭据不进入公共源码。

使用已有跨平台进程 helper 和 scripts/pnpm-process.mjs。文件系统使用原生 path，资源/manifest 路径统一 /；文件 URL 使用 fileURLToPath/pathToFileURL。macOS 检查不能作为 Windows 实机验收。

## 编辑器与类型

执行 pnpm prepare:types 从 canonical owner 生成 Plugins 的编写上下文。.typecheck 是派生产物，不提交、不发布，也不参与生产 Runtime。

包检查和消费者检查沿用当前脚本；不通过宽泛模块声明、skipLibCheck 或关闭 upstream 检查掩盖真实 API 不兼容。依赖安装、类型、构建、浏览器和实际目标平台分别验证。
