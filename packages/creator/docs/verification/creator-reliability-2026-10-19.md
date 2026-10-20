# Creator 执行可靠性修复（2026-10-19）

本轮增量修改仅涉及 `packages/creator`。基于 HEAD `20a42ca5` 及已有工作区修改；未撤销此前优化，也未修改 Operator、跨包契约、写权限或 AppUIModel mutation 路径。

## 修改

- `validation/service.py`、`validation/errors.py`：Registry 同步在原修改锁内检查磁盘后态。写入后异常、返回错误 path/changed 都先记录实际修改，再报告完整性错误；回执和撤销事务保留原 before/after。未写入的失败不增加修改 revision。异常链保留原始错误，完整性失败禁止模型自动修复/重试，本轮请求内保持阻断。取消仍传播 CancelledError。
- `validation/command_runner.py`、`validation/windows_job.py`：POSIX 独立进程组；Windows Job Object + 受 stdin 门控的启动包装进程，在加入 Job 后才启动命令。正常退出、超时和取消均清理后代；TERM/CTRL_BREAK 后有界等待，再强制清理。启动参数仍来自既有验证白名单，不提供 shell 工具。命令退出与输出 EOF 分开等待，reader tasks 在 finally 取消并回收。保留已收到的有界输出。
- `validation/models.py`、`validation/service.py`、`validation/tool.py`、`activity/recorder.py`：区分 timeout/start/configuration/permission 等失败。增加 `retryInfrastructure=true` 显式入口，每个 command/revision 最多一次基础设施重试，同时绕过工具缓存和对应命令缓存；确定性源码错误继续缓存，权限/完整性错误不重试。分类元数据留在内部，既有 receipt/check 字段不扩展；通过原有 failureSemantics 返回分类和恢复指导。
- 仅在 revision 0 允许重试首次失败的基础设施 baseline，最多一次；其 TypeScript 差分同时刷新。已经发生修改时不得替换任务前 baseline。

## 回归命令

在 `packages/creator/python` 执行：

```text
.venv/bin/python -m pytest tests/test_validation_reliability.py tests/test_validation_process_cleanup.py tests/test_validation_command_runner.py tests/test_registry_recovery_evidence.py tests/test_creator_transactions.py -q --durations=7
```

实际执行结果：上述五个模块 **83 passed in 12.59s**，其中新增两个测试模块覆盖 32 个参数化用例。

新增覆盖：写后异常、错误 path/changed、未写失败、取消后记账、撤销恢复、结构化完整性错误、工具/服务两层缓存、同 revision 环境恢复、重试上限、权限/源码错误不重试、baseline 恢复边界、真实常驻后代、继承/关闭输出管道、忽略 TERM、单次/连续取消，以及 Windows 分组和 Job 句柄生命周期模拟。

进程故障测试使用缩短的 deadline，每个场景断言在 3 秒内结束，并检查 reader/cleanup tasks 已结束、子进程心跳停止、POSIX 进程已退出或为无运行能力的 zombie。生产默认命令预算仍为 120 秒，TERM 和 KILL 等待各 2 秒，输出管道等待 2 秒。

其他检查：Creator build、Creator typecheck、`git diff --check` 均通过。最终 Python 修改后重新复制分发资源，七个涉及的 Python 文件与 dist 内容逐一一致。构建保留已有大 chunk 和 pnpm 配置警告。

## 扩展回归与限制

对七个既有模块（validation、validation_differential、activity、transactions、contract_fixtures、command_runner、registry_recovery_evidence）共 104 项进行修改前/后对照：两边均 80 通过、24 失败，节点级 outcome 完全一致。修改前版本通过 import loader 从 HEAD 读取本轮涉及的五个既有 Python 模块，其他工作区文件和测试环境保持一致。

既有失败包括旧 fixture 缺少 `.agent-ui/project.json`、baseline/归因预期与当前实现不符，以及 Operator contract fixture 不匹配。本轮没有通过放松权限、项目配置或契约校验来让这些旧测试通过。

Windows 仅完成参数/Job API 生命周期模拟和跨平台代码审查，未在真实 Windows 机器执行；真实进程测试当前在 macOS 执行。同一组真实进程测试可在 Windows 继续运行。没有执行真实模型端到端任务、浏览器视觉验收或性能 p50/p95 对比；本轮不宣称这些已通过。

构建成功不重载已启动的 Python 进程。使用当前源码构建产物测试 Creator 时，需要重启已有 Creator 服务。
