# Creator 思考显示切换：目标名称误拦截修复与实测

原始请求：`我想深度思考的时候不显示内容，显示正在思考就好了，思考完成后消失`

## 结论

修复后，Creator 在原来的界面和工程中完成修改；随后在真正的 Google Chrome 中通过原生 CUA 发送 Mock 流式请求，看到“正在思考...”出现、推理正文不展示、完成后提示消失并显示答复。没有手动修改测试工程来帮助模型完成任务。播放控制操作前后源码哈希一致。

修复前两轮中，模型都已找到 reasoning/p11 和 thinkingIndicator 槽位，并提交了正确的组合操作。失败源是 Host 把自然语言请求与预置名称/动词做匹配，返回 needs_target_clarification，继而用固定回复结束执行。不是槽位能力缺失，也不是模型没有发现插件。

## 修改边界

- 路由只判断只读/允许项目编辑，不再提前判定、锁定待移除插件。
- 通用 coding Agent 根据实际工程证据选择实例，Operator 继续检查哈希、实例、schema、槽位和原子事务。
- 保留只读、取消、新插件开发确认、首次源码接管确认、永久源码删除确认及实例保留保护。
- 没有修改主提示词、Skill、文档或 vendor；去掉了已无调用方的目标澄清固定回复。

## 原始任务对照

相同 deepseek-v4.1-flash、32K 输出配置，262144 上下文、12000 保留、8192 摘要、温度 0.2、单请求超时 120 秒；原生 Playwright 验证仍关闭。

| 指标 | 修复前原始请求 | 修复后原始请求 |
| --- | ---: | ---: |
| 提交至原生回执 | 47.484 秒 | 80.876 秒 |
| 第一次写入完成 | 无 | 32.871 秒 |
| 主模型调用 | 5 | 9 |
| 原生工具调用统计 | 6 | 9 |
| 有执行事件的工具处理器 | 4 | 8 |
| 主模型输入 token | 188494 | 449748 |
| 主模型输出 token（含 reasoning） | 2692 | 4880 |
| 修改结果 | 目标澄清，零修改 | 7 个文件，修改及校验通过 |

修复后的输入中缓存读取为 373632 token，是输入的子集；reasoning 输出为 3267 token，是输出的子集。用量仅来自主 Agent 的 model_result，不含未记录的路由/供应商请求，不能当作账单总量。

这不是严格的单变量速度比较：保留原来浏览器会话，包括两轮失败历史；修复前提前失败，修复后实际写入并校验。不能据此宣称变快或变慢，问题 1–3 也未在本轮重跑。

模型先停用 reasoning 并插入 thinking-indicator，随后为消除停用实例警告而从组合移除 reasoning。reasoning 四个应用文件哈希均保持原样，未删除源码。新建的是现有官方插件的薄应用层，不是开发新插件或源码接管。

## 验证

- Creator：54 个测试文件、564 个测试通过；最终 typecheck、i18n 和 build 通过。初次全量运行的两个失败是旧路由测试仍使用原有私有签名/schema；调整测试后全量通过，初次日志也保留。
- 实际 Creator 回执：changed-and-verified，projectRevision/validationRevision 均为 3，运行时通过。
- 真正 Chrome：原生 CUA 点击发送。运行期截图及 AX 包含“正在思考...”；完成期 AX 移除了该提示和“停止生成”，出现“思考已完成，开始回答。”；没有可展开推理正文。使用现有 Mock 的“思考占位”场景、2× 时间倍率，测试的是前端对 AG-UI 流的消费。
- 播放前后源文件无变化，见 after-demo-hashes.json 的 demoChanges=[]。
- 没有新增平台相关路径/进程逻辑；中文路径等现有回归在 macOS 运行。未做真实 Windows 验收。

## 仍可优化的地方

本次写入已不受目标名称门禁阻拦，但不是最短执行路径：停用实例警告促成第二次组合修改；verify_creator_outcome 与 enable_creator_tools 被同批调用拒绝一次，额外消耗一次主模型重试。没有在本轮继续扩大修改范围。

## 证据

- summary.json：原生计数、用量、两次组合输入、验证边界。
- native-metrics.jsonl / public-run.sse：真实 UI 请求的遥测与公开协议流，无模型私有推理正文。
- before-failure-evidence.json / before-summary.json：两轮旧失败与原始任务耗时。
- before-project/ / after-project/：修改前后生成项目源码。
- chrome-thinking-content.png / chrome-complete-content.png：Chrome 运行中、完成后的截图；对应 AX 文本与 chrome-behavior.json。
- checks/：测试、typecheck、i18n、build 日志。
- updated-package-snapshot.json：运行的冻结包快照；updated-live-server.json：仅替换开发工具、保留原目标工程及前端安装的记录。

当前审阅地址：http://127.0.0.1:5173/ 。Chrome 保持最终预览，原 IAB 标签保留完整 Creator 会话；浏览器会话记录是各标签独立的。临时服务需保持运行才能访问，原生运行时数据和凭据不入库。
