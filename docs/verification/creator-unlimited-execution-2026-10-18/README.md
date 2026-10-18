# Creator 取消累计执行上限（2026-10-18）

移除 ToolProtocolMiddleware 的累计模型调用预算（原默认 12，Domain write 原 24），保留调用计数与协议观测。移除调用端的执行图步数限制（原 30 / 60）和工厂默认 9999；锁定的 LangGraph 不支持用省略配置表达无限运行，因此工厂与统一 streaming runner 使用正无穷关闭步数比较，未替换成另一个大整数。保留 thread/checkpoint 配置及回调组合。

保留用户停止、单次请求超时、无进展重复检测、工具权限、显式修改确认与完成验证。8192 单次输出额度不变。未修改 vendor 或引入平台相关执行逻辑。AGENTS.md 和 Python README 已同步。

## 验证

- 相关 229 项测试通过：`focused-tests.log`。Minimal、inspect、write 各完成 40 次不同文件读取和 41 次模型调用；经过真实固定版本执行图与正常 Agent.run，超过原 12/24 模型调用及 30/60 图步数上限；runner 也不会被旧调用端配置重新限制。模型为确定性 fake，不是 41 次网络模型调用。
- 同组覆盖停止、权限、无进展保护、协议处理、流式事件和 checkpoint 中断/恢复。
- Creator 正式构建通过：`creator-build.log`。
- 重新打出实际 Creator tgz，在独立工程 `/Users/yifei/Coding/agentui_test/npm-release-host` 普通 npm 安装；针对 node_modules 内实际 Python 包重复长任务验证，4 项通过：`installed-package-long-tasks.log`。
- 当前正式 CLI 已重启于 http://127.0.0.1:4198/ ，默认 managed packaged_venv 服务 ready：`creator-startup.log` / `installed-runtime.json`。没有 Python 路径或 sidecar 覆盖配置；更新前后工程 src 完整摘要一致。

## 未扩大验收的范围

扩展运行 `test_domain_tool_batch_policy.py` 时有 13 项旧断言/缺少 project.json 的 fixture 失败；使用修改前的真实 Creator 安装包单独运行，复现相同 13 项失败（另 8 项通过），见 `old-package-batch-baseline.log`。没有修复这些旧 fixture，仅移除了其中一条强制要求旧 24 次上限的断言。首次组合运行中新加长任务 write 用例还缺少现有只读完成声明，补齐测试声明后相关 229 项全部通过，原始输出保留在 `expanded-tests-first-run.log`。

这次不宣称宽范围源码探查效率已改善，也没有通过网络模型刻意制造 41 轮请求。未进行 Windows 真机验收；实现仅改 Python 调度配置和计数检查，没有新增路径、shell 或平台假设。
