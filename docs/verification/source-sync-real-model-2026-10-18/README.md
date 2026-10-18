# 真实 Creator 源码同步与模型冲突合并验收

最终结果：普通源码同步与真实模型冲突合并均通过。汇总见 final-verification.json。

## 场景与结果

- 在两个独立临时 npm 消费工程中，预置已托管的 Composer 0.0.1、实际安装的 Plugins/Runtime 0.0.2 候选包。通过真实 Creator 更新页执行，未用独立演示页面、接口 mock 或伪造模型回复。
- 普通同步（sync/）：应用层保留浅紫背景、12px 内边距、20px 圆角，另一处已有源码修改也保留。真实点击“确认更新”，确定性同步实际包内快照、通过 Host 验证并采用 0.0.2。这一步不需要模型。
- 冲突合并（最终 compact-context/conflict/）：已有定制把工具栏的真实 JSX 节点移到输入框上方。真实点击“让 Creator 合并”，使用配置的真实外部模型完成三方合并；模型自动 Runtime 回执为 changed-and-verified，runtime-verification 为 passed。
- 模型结束后源码基线仍保持原值。回到更新页，核对页面工具栏顺序后，再点击“验证并完成同步”，采用 0.0.2；模型没有自行完成采用。
- 应用层 index.tsx、definition.ts、AppUIModel、package.json、package-lock.json 逐字节保持不变。源码工具栏顺序在确认前后均核对，最终源文件也确认 actions 在 input 之前。
- 实际输入“保留应用层，合并新功能”，新增字数统计正确显示 11。各最终场景 Host verify:ui、typecheck、build 通过，浏览器错误为零。

## 本轮发现与修正

第一轮完整流程通过。复验中真实发现一次模型把本地节点顺序误当作原版并恢复了新版布局，同时 Runtime 回执不可用；没有将该轮记为通过或完成源码采用。另两轮模型任务超时，记录保留在 final-prompt/、final-validated/、retry-after-timeout/。截断日志记录了 2048 输出上限与 length 结束原因。

为此调整 Operator 的模型合并请求：明确列出检测到用户修改的文件，强调结构/节点顺序也属于必须保留的定制，要求合并后检查这些差异；仅向模型提供有本地或上游变化的文件，保持返回给手动对比 UI 的完整文件列表；结束回复用简短用户语言解释更新、保留的定制及最终确认，不再使用旧按钮与基线术语。新增聚焦验证检查未变化的文件保留在对比 API、但不塞入模型请求。

最终独立复验使用相同配置模型，输出额度临时设为 8192（只影响验收进程，未改 .env.creator.local）。该轮一次真实模型请求成功完成合并、Runtime 验证与最后确认。不能把此结果解释为默认 2048 输出额度已经稳定，或模型总能无损合并；源码合并仍保留用户审阅确认。

## 截图

- sync/02-confirm-card.png：普通同步确认。
- sync/06-sync-complete.png：普通同步完成。
- compact-context/conflict/02-confirm-card.png：冲突与保留说明。
- compact-context/conflict/03-real-model-merging.png：交给真实模型。
- compact-context/conflict/04-model-finished-awaiting-user.png：真实模型结束与 Runtime passed。
- compact-context/conflict/05-review-card.png：用户最终确认。
- compact-context/conflict/06-sync-complete.png：确认后的同步完成。
- compact-context/conflict/07-final-composer.png：既有样式/工具栏顺序及新增字数统计。

## 验证边界

候选版本来自本地 HTTP Registry 的真实打包产物，不是 npm 线上发布验收；源码所有权和已有定制作为前置场景准备，本轮不重复验证接管授权旅程。旧 fixture 未修改，也未修复或运行旧 fixture 全套失败项。Windows 仅审阅原生路径、进程助手与复制/清理逻辑，未做原生 Windows 验收。验证脚本使用单调时钟判断超时。

脚本 scripts/verify-source-sync-real-model.mts 接受候选 releases.json、输出目录及官方归档清单；--conflict-only 可单独复验模型合并。临时工程与服务均已清理。
