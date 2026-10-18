# 自动 Runtime 完成检查与源码 fixture 修复验证

本轮在真实 Creator、真实外部模型中重跑 Composer 薄应用层 → 确认接管 → 本地适配层修改 → npm 包更新 → 更新页三方合并。验证脚本对 props、takeover、source-merge 三个完成阶段分别断言 receipt.verification.status 为 changed-and-verified，runtime-verification 为 passed；不接受通过改文案、沿用旧成功结果或浏览器断言替代自动完成检查。

## 根因与实现

完成卡只读取已经缓存的诊断。模型只查询布局时没有诊断缓存；缓存因新报告或修订失效后，也可能缺少当前完成证据。现有自动验证尾段仅覆盖特定组合操作，未覆盖普通源码修改。现在在当前修订的静态验证通过后，由 Host 自动补取当前哈希的 Runtime 诊断并验证组合，然后交给原完成 gate。保留 current_result 的修订、run ID、证据 hash、错误与新鲜度校验。Host 忙碌时做有界重试；无浏览器、断连、过期或失败不能变为通过。Runtime passed 表明当前运行诊断/组合通过，不等同于任意视觉或交互需求已被自动证明。

旧源码修改 fixture 还在根 plugins/ 布置文件，缺少 .agent-ui/project.json。测试现使用有效 sourceRoot，校正观察路径与断言；保留一个根目录同名插件不被修改的隔离检查。另校正相关完成测试中旧的事件 sink、check_id、布局方法、共享 metrics 引用、基线采集时机和公开工具参数预期，没有放宽生产路径或授权规则。

## 定向检查

见 targeted-tests.json：148 passed，包含原有源码修改组 27 passed。新增负例覆盖无浏览器、断连、新错误、源码新修订、静态失败或旧修订/static_only 不触发 Runtime 完成刷新。接管准入回归覆盖不同 intent、已有开发计划优先、目标范围和新身份创建仍需授权；源码 owner 精简工具列表必须保留原生接管工具，并在执行后允许跨所有权层继续工作。另将一个 prompt 断言改为按空白规范化后匹配，避免换行格式改变语义无关断言。

额外抽查 test_plugin_development_authority.py / test_plugin_development_golden.py：14 passed、42 failed。主要仍使用缺少合法 sourceRoot 配置的旧工程 fixture，另有旧 validation substitute；未纳入本轮原有 25 项源码修改 fixture 修复，也不宣称这些扩展套件或全仓通过。

## 真实流程证据

本轮独立保存截图、creator-runs.json、creator-logs/、runtime-completion-verdicts.json、update-responses.json 和最终 verification.json。Creator 预览使用真实组件及本地 AG-UI 测试服务；Creator 模型使用 Host 的外部真实模型配置，没有伪造模型响应或替换 UI。

首轮中，conditional 开发意图把已接管源码的普通修改错误地送入新插件开发确认循环；失败证据保留在同级 creator-runtime-completion-2026-10-17-first-attempt。准入现识别已接管实现和有效薄应用层，普通编辑无需再次建立新插件计划。已有 pending/authorized 计划的写入阻断和目标限制、新 Plugin 身份创建授权、未接管官方实现限制及受保护路径规则均保留。修复后启动全新 Host / Creator 会话重跑。

第二轮实际 selector 选中 plugin_source owner；source lane 工具白名单缺少 takeover_plugin_source，导致模型文字声称调用但无法得到确认卡。该轮由测试操作者中止，证据保留在同级 creator-runtime-completion-2026-10-17-second-attempt。补齐白名单与跨层展开后再次启动全新会话；源码确认仍通过原生工具中断，没有直接修改 ownership 或伪造确认响应。

第三轮外部 MiMo 返回 MODEL_TOOL_PROTOCOL_ERROR，原生工具调用协议修复一次后仍失败，没有获得完成回执；证据保留在同级 creator-runtime-completion-2026-10-17-third-attempt。验证脚本现在对 selector / 模型协议失败通过真实 Creator 重新提交同一个用户请求，最多三次，不改写 SSE 或模型结果。成功判据仍是实际完成回执与浏览器结果。

升级采用本地构建的 npm tarball 0.0.1 → 0.0.2，没有发布公网或声明已通过公网安装验收。生成 Host 的 verify:ui、typecheck、build 以及样式、DOM 顺序、实时字数计数、应用层/定义/AppUIModel 字节保留的结果以 verification.json 为准。

未执行原生 Windows 或全仓测试。改动使用 pathlib/native path 与逻辑 / 路径分离、异步有界等待及既有跨平台 pnpm helper，不引入 POSIX 进程或 shell 假设。
