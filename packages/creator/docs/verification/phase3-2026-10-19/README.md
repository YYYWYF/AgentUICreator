# Phase 3 契约与真实 Creator 任务验收

本轮只增加 Creator 测试、隔离测试项目准备器和证据文件。手册、提示词与运行实现没有新增修改；保留工作区此前已有的改动。

## 契约集

`packages/creator/python/tests/test_phase3_authoring_contract.py` 使用实际安装的 Plugins catalog，通过真实 Operator 初始化独立 platform 工程，再调用 Creator 的 mutation tool/service、文件权限后端、接管工具和完成门禁。没有模型决策、伪造 Operator 返回或伪造 Runtime 观测。

新增契约共 18 项：**14 passed, 4 xfailed**；配套既有测试 158 项通过，最终合并执行结果为 **172 passed, 4 xfailed in 43.22s**。四项 strict xfail 是明确复现的缺口，不能算通过；后续修复若使其通过，strict 会要求移除该标记。

| 契约 | 证据 / 结果 |
| --- | --- |
| 实例、Slot 与移动/显隐 | 从当前 inspect 返回确定 layout_slot，移动 agent-identity，隐藏 dictation，其他实例保持不变；一次事务 |
| Runtime slot id 不得作为 authoring ref | 输入在 Operator transport schema 被拒绝，OPERATOR_PROTOCOL_INCOMPATIBLE；无写入，定位 input.operations.0 |
| Plugin id 不得冒充实例 id | PLUGIN_NOT_FOUND；无写入 |
| 非法 Panel 尺寸 | INVALID_REQUEST，消息定位 input.operations[0].set.width 并指出 Grid track 与元素尺寸的区别；无写入 |
| 缺失相对目标 | AUTHORING_MOVE_UNSUPPORTED，details.reason=anchor-not-found；允许现有有界语义重规划 |
| 未声明 Slot | **已知缺口**：Compiler 的 plugin-slot-not-declared 被抹平成 OPERATOR_OPERATION_FAILED；没有写入，但结构化语义丢失。需要 Operator 保留 candidate/compiler issue，并由 Creator 消费，超出本轮只补测试的范围 |
| stale hash | HASH_CONFLICT 后旧 observation 失效；不重新 inspect 的调用被 Host 拒绝；重新观察后可执行，保留外部修改 |
| 重复成功事务 | 通过不重复写入、revision 不增长的断言；**已知缺口**：仍发生第二次 Operator dispatch。strict xfail 保留缺少请求去重这一项，不将它描述为重复修改文件 |
| child Slot 重排 | move_plugin 同容器的 index 按移出前的位置计算：copy 原为第 0 项时，index=1 为 no-op，index=2 才会移动到 reload 后面。move_plugin_to 相对移动仅支持直接位于 Layout Slot 的实例，不能直接用于该 child Slot 场景 |
| union 参数校验修复提示 | **已知缺口**：maxWidth 传字符串时日志已有 set.maxWidth/type，但 _repair_validation_hint 返回 None，修复模型只收到顶层参数形状，不知道应改为数字。真实任务两次重复类型错误后失败；测试要求将叶子字段和期望类型传入有界修复反馈 |
| no-op 后发生真实修改 | **已知缺口**：旧 semantic_noop 标记没有随真实修改清除，实际改了文件的移动任务最终被标为 already_satisfied；真实任务状态正确，但完成类型不准确 |
| npm 公共 props | 修改项目 composer 薄应用层的公开 rootProps 后 typecheck 通过；implementationOwnership 仍 npm，不生成 source/ |
| 实现源码接管 | 真实计划绑定已安装版本，通过真实 Graph interrupt/resume 的显式测试 approve/decline：确认前没有提取；确认后保留已有 rootProps 定制和原始 AppUIModel；实际 typecheck/build 通过。approve 是隔离 fixture 的模拟用户决定，不是对真实项目的授权 |
| app-ui.json 文件写保护 | write/edit 两条通用文件路径均被拒绝 |
| 静态 / Runtime / 浏览器证据 | 实际静态验证通过时 receipt 明确 static_only / runtimeStatus=not-run；缺少 Runtime 证据不能记录 runtime passed。测试不伪造浏览器观测 |

已有 `test_plugin_source_takeover.py` 与 `test_completion_runtime_refresh.py` 实际执行 **158 passed**，另覆盖失效计划、伪造答案、读写权限、源码后续编辑和 Runtime evidence 刷新边界。

从 `packages/creator/python` 运行：

```text
.venv/bin/python -m pytest tests/test_phase3_authoring_contract.py tests/test_plugin_source_takeover.py tests/test_completion_runtime_refresh.py -q --tb=short -rx
```

Windows 使用 `.venv/Scripts/python.exe`。准备器使用 Node 原生 path、file URL 和 junction，不依赖 POSIX shell 或 Windows symlink 权限。尚未执行真实 Windows 验收。

## 真实模型任务

`tests/live/test_phase3_creator_tasks.py` 通过 Creator `/creator` 的真实 ASGI/SSE 接口，走正常请求路由、权限、Agent、真实 Operator 和目标工程静态验证。模型来自根目录 `.env.creator.local` 的现有配置，没有 monkeypatch，也没有跳过模型路由。每项任务使用从相同 seed 克隆的独立项目；不改示例工程。

本次配置：mimo-v2.6-flash，temperature=0.2，maxTokens=8192，每次请求 timeout=120 秒，maxRetries=2。未设置累计模型调用上限。

任务：插件公开 API 只读问答、隐藏语音按钮、移动回复动作、设置布局 maxWidth、薄应用层 rootProps 定制、源码接管计划确认。状态断言之外，同时检查 RUN_ERROR、completion 和受保护文件修改；接管确认任务停在问题处，不自动批准。

运行入口（从 `packages/creator/python`）：

```text
.venv/bin/python -c 'import os,pytest; os.environ["CREATOR_RUN_LIVE_MODEL"]="1"; raise SystemExit(pytest.main(["tests/live/test_phase3_creator_tasks.py","-q","-s","--tb=short"]))'
```

每项任务的 `live/<case>.json` 保存结果和实际指标；`.events.json` 保存 SSE 事件；`.jsonl` 保存经过现有日志脱敏的轨迹；`.patch` 和修改前后 hash 保存文件证据。API 密钥和 endpoint 不写入报告。

真实任务使用当前默认 static_only 策略。Runtime 和浏览器视觉结果单列为“未采集”，不能把静态成功或模型文字当作视觉验收。六个任务是诊断样本，不构成同模型前后性能对照，也不足以给出稳定的 p95 收益结论。


## 本次真实任务结果

实际跑完：**5 passed, 1 failed，796.47 秒**（包含隔离项目准备和 pytest 开销）。这里的 passed 是自动化状态、错误和文件边界检查，**不等于所有回答质量均通过**。

| 任务 | 自动状态检查 | 请求耗时 | 领域模型调用 | 领域累计输入 token | 备注 |
| --- | --- | ---: | ---: | ---: | --- |
| 插件公开 API 问答 | 通过 | 69.101s | 3 | 28,984 | 无写入；人工复核不通过：将 blocked/owned:false 误说成不可接管，实际同版本可走确认接管 |
| 隐藏语音按钮 | 通过 | 154.798s | 6 | 161,676 | 只改变 dictation enabled；一次 observation 不完整的尝试被拒绝，重读后成功 |
| 移动回复动作 | 通过 | 326.482s | 12 | 552,904 | 最终顺序正确；经历 observation 缺失、index no-op、相对移动不支持，再转 index=2 成功；completion 被旧 no-op 标记误记为 already_satisfied |
| 设置主面板 maxWidth | **失败** | 47.502s | 3 | 65,667 | 连续传入字符串 960px，而 schema 要求数字；修复反馈缺少叶子类型信息，最终 MODEL_TOOL_PROTOCOL_ERROR，无文件变化 |
| 薄应用层 rootProps 圆角 | 通过 | 112.481s | 11 | 128,276 | 只改 composer/index.tsx，保留原 props/style 透传；静态验证通过，无接管 |
| 请求源码接管计划 | 通过 | 80.840s | 4 | 61,641 | 真实 takeover 工具生成绑定 planHash 的确认问题；没有模拟批准，没有写入 |

路由 candidateCount 六项均为 **0**；requestToolCount 根据任务状态为 **9–22**。这证明当前已没有把全部候选塞入普通路由，但不能证明总任务已足够快。所有 input token 是各领域模型轮次的累计值，路由独立记录在 summary.json；不是单次上下文大小，也不等于实际账单计费 token。

关键诊断：

1. 优先补 Host 的通用 schema 叶子校验反馈，避免合法意图因为一个尺寸类型错误变成笼统“malformed tool intent”。这项可在 Creator 内修复，不需要扩大权限。
2. 默认宽泛 inspection / 分页结果与 mutation 工具展开之间仍有摩擦。模型在 observation 尚不完整时尝试修改会被安全拒绝，但多出重读和模型轮次；应优化状态与事实投影，而不是去掉 hash/分页门禁。
3. child Slot 重排的 index 语义与 Layout 相对移动能力不一致，模型需要多次试错。工具/契约应更明确表达适用范围和坐标语义。
4. 修复 no-op 状态随真实修改失效以及重复成功请求去重；当前前者导致完成类型不准确，后者只是多一次 Operator 访问，没有重复写文件。
5. 未安装源码、未接管和不可接管需要在事实输出中明确区分。真实接管确认成功，说明只读问答中的“不可以接管”是知识解释错误，不是该项目真的不支持接管。

本轮没有为把测试变绿而修改实现、手册或提示词。四项严格 xfail 和一项真实任务失败均保留；没有通过绕过权限、直接编辑 AppUIModel 或伪造 Runtime/视觉证据完成任务。详细机器可读指标见 [summary.json](./summary.json)。
