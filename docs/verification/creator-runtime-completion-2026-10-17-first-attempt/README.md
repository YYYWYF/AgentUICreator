# 自动 Runtime 完成检查与源码 fixture 修复验证

本轮在真实 Creator、真实外部模型中重跑 Composer 薄应用层 → 确认接管 → 本地适配层修改 → npm 包更新 → 更新页三方合并。验证脚本对 props、takeover、source-merge 三个完成阶段分别断言 receipt.verification.status 为 changed-and-verified，runtime-verification 为 passed；不接受通过改文案、沿用旧成功结果或浏览器断言替代自动完成检查。

## 根因与实现

完成卡只读取已经缓存的诊断。模型只查询布局时没有诊断缓存；缓存因新报告或修订失效后，也可能缺少当前完成证据。现有自动验证尾段仅覆盖特定组合操作，未覆盖普通源码修改。现在在当前修订的静态验证通过后，由 Host 自动补取当前哈希的 Runtime 诊断并验证组合，然后交给原完成 gate。保留 current_result 的修订、run ID、证据 hash、错误与新鲜度校验。Host 忙碌时做有界重试；无浏览器、断连、过期或失败不能变为通过。Runtime passed 表明当前运行诊断/组合通过，不等同于任意视觉或交互需求已被自动证明。

旧源码修改 fixture 还在根 plugins/ 布置文件，缺少 .agent-ui/project.json。测试现使用有效 sourceRoot，校正观察路径与断言；保留一个根目录同名插件不被修改的隔离检查。另校正相关完成测试中旧的事件 sink、check_id、布局方法、共享 metrics 引用、基线采集时机和公开工具参数预期，没有放宽生产路径或授权规则。

## 定向检查

见 targeted-tests.json：130 passed，包含原有源码修改组 27 passed。新增负例覆盖无浏览器、断连、新错误、源码新修订、静态失败或旧修订/static_only 不触发 Runtime 完成刷新。

## 真实流程证据

本轮独立保存截图、creator-runs.json、creator-logs/、runtime-completion-verdicts.json、update-responses.json 和最终 verification.json。Creator 预览使用真实组件及本地 AG-UI 测试服务；Creator 模型使用 Host 的外部真实模型配置，没有伪造模型响应或替换 UI。本轮模型额外提出开发范围确认，截图 07b/07c 保留该真实步骤；在同一会话中回答后继续。

升级采用本地构建的 npm tarball 0.0.1 → 0.0.2，没有发布公网或声明已通过公网安装验收。生成 Host 的 verify:ui、typecheck、build 以及样式、DOM 顺序、实时字数计数、应用层/定义/AppUIModel 字节保留的结果以 verification.json 为准。

未执行原生 Windows 或全仓测试。改动使用 pathlib/native path 与逻辑 / 路径分离、异步有界等待及既有跨平台 pnpm helper，不引入 POSIX 进程或 shell 假设。
