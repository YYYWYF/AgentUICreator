# Creator Playwright 验证开关 · 2026-11-05

项目 Playwright 交互验证默认关闭。`CREATOR_BEHAVIOR_VERIFICATION_ENABLED=1` 显式开启，`0` 关闭；配置属于 Creator Host，重启 Agent 后生效。开关独立于静态/Runtime 验证模式，不改变生成项目或生产依赖。

关闭时不注册或暴露 `verify_ui_plugin_behavior`，不以缺少交互测试阻塞交付；回执记录 `interaction: not-run`、`interactionPolicy: disabled`。静态检查、类型检查、可选构建和已开启的 Runtime 验证保留，实际失败继续阻塞。

验证：

- 相关 68 项测试通过；随后 Creator 完整 52 文件、551 项测试通过，见 `creator-tests.log`。
- Node 和浏览器类型检查通过，见 `creator-typecheck.log`。
- Creator 完整构建通过，见 `creator-build-final.log`。
- 首次构建编译成功，离线文档源哈希过期导致最后阶段失败，保留 `creator-build.log`；按现有 `docs:package` 流程重新生成后通过，见 `documentation-package.log`。没有绕过文档校验。
- 构建产物实际启动两个独立 Node Agent，通过认证的 `/health` 确认默认关闭、显式开启，并且 Runtime 模式保持 `static_and_runtime`。见 `health.json`；可运行 `node artifacts/creator-behavior-policy-20261105/verify-health.mjs` 重放，不调用模型。两个进程均退出，临时项目已清理。
- 回归覆盖关闭时工具不可见、交付不要求浏览器证据、不会把保存证据误标为通过、静态/Runtime 失败仍阻塞、显式启用后保留原有行为和配置非法值检查。

本轮未运行真实 Windows；新增产品逻辑仅解析开关和控制工具/交付判定，没有新增平台路径或进程实现。独立进程验证脚本使用原生路径、文件 URL 转换及现有跨平台进程清理方法。没有修改 vendor、提示词、Skills、模型配置或工作区中原有的插件样式改动。
