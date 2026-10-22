# 开始使用首版验证记录

日期：2026-10-22。用户确认：手动配置为教程主线，AI 辅助放在章末；平台式助理无缝占满业务主内容区，取消额外标题、说明、卡片外框及四周间距。

## 实测环境和边界

- 真实业务工程：`/Users/yifei/Coding/agentui_test/cmb-service-workbench`，开发地址 `http://127.0.0.1:5178/`。
- 原始工程副本：`/Users/yifei/Coding/agentui_test/documentation-session-baseline`。
- 保留 React / React DOM 19.3.1、Ant Design 6.6.7。47 个当前资源描述的 React 要求从固定 19.1.1 改为运行包 peer 范围 `>=18 <20`；历史快照和库自身开发基线未改。
- 使用本地构建的 npm `.tgz`，没有验证尚未发布的包名在公共 registry 上可直接安装。目标工程仅使用文件发布包，无源码 workspace 链接。文件 overrides 产生的 peer 显示警告不等同于公共发布组合验收。
- Creator 通过安装包 CLI 独立启动于 47833，Python 使用包管理的缓存虚拟环境。模板在真实 UI 中初始化成功。
- 手动导入公开 `Agent` 入口，增加当前页面工作区切换。未更改 Runtime/framework，未接管 Plugin 实现源码。
- 四周间隙来自 Host 全局 `main` 样式泄漏到平台内部 main；已将原 Host 规则收窄为 `.main-shell > main`。实际 DOM 检查：业务主内容、平台 shell、布局根的边界一致，padding 为 0；随后用真实 Chrome 截图目视确认。
- 对话使用开发 Mock 的 `reasoning-tool-success` 场景。思考、工具完成和最终回复均实际显示。没有接入真实银行业务 Agent。
- 可选 AI 模型首轮因服务要求 `x-opencode-session` 返回 400；启用已有配置后进入正常意图识别和工程读取。用户将教程改为手动主线后已停止该任务，未将 AI 自动修改标记为成功。

## 截图

`website/docs/public/images/start/` 包含原工程、Finder 工程目录、Creator 入口、选择工作台、初始化完成、无缝挂载和完整演示对话截图。悬浮式与嵌入式对比来自原有 Northstar / Atlas Demo，分别为 5181 / 5182；不是初始化后自动生成的业务界面。截图均来自实际操作，未合成。

## 已运行检查

- Host React 兼容性专项：5/5，包括 18.3.1、19.1.1、19.3.1 保留原 manifest 且不触发安装；17/20 不兼容检查。
- 依赖版本守卫：5/5，当前资源 React 兼容范围例外不放开其他安装依赖；仓库守卫通过。
- Plugins 构建与公开声明边界检查通过。Creator Operator/TS/browser 构建完成；其文档阶段最初因尚未完成的链接失败，补齐文章后文档构建和打包检查通过。
- 示例工程 typecheck、4 项工单单元测试、78 个中英文 Host 文案对齐、生产 build 通过。构建仍有大 chunk 提示。
- 实际浏览器操作验证：助理进入/切回工单、筛选变为 1 条、详情抽屉和新建表单入口；未通过这次检查创建额外工单。
- 生产输出扫描未发现本次配置的模型密钥、Dock client 或 Mock handler 标记。
- 文档站 typecheck、build、离线文档 check 通过；文档资源测试 4/4（含 Windows 逻辑路径 fixture）。实际浏览器检查手动教程、侧栏顺序及 Markdown 入口。
- 最终本地 Creator tarball 含 23 个索引文档资源；逐项校验压缩包内文件 SHA-256，包含手动教程、章末 AI 辅助和更新截图。

## 限制

未执行真实 Windows 环境验收。React 修复只改变资源兼容声明和守卫，路径使用现有原生 path API，无新平台进程逻辑。旧 `migrated/ensure-resource-packages.test.ts` 与专项并跑时有 3 个 A2UI 依赖预期失败，未作为本次 React 修复通过项，也未修改这些旧测试。未运行全仓回归、提交、推送或发布 npm。
