# Schema 兼容修复及复测

2026-11-04，Windows，Node 22.23.4，deepseek-v4.1-flash。

## 已完成的修复

请求路由现在能识别 HTTP 200 的 SSE 流内明确返回的 Schema 语法拒绝，包括有或没有 `Streaming response failed:` 前缀的 `[400/422] Grammar error: Unimplemented keys: [...]`，并使用原有 `json_object` 回退。

完整分类仍经过原来的本地验证：权限值、字段集合、插件身份和去重规则均未放宽。认证错误不触发该回退，错误内容不直接构成修改授权。没有移除原始 Schema 的 uniqueItems，也没有更改提示词、Skills 或新增固定 Agent 执行流程。

代码入口：

- [model-policy.ts](<WORKSPACE>/packages/creator/src/agent/model-policy.ts:4)
- [runner.ts](<WORKSPACE>/packages/creator/src/agent/runner.ts:142)

上轮日志串行追加的修复继续保留。兼容修复没有手工改写测试目标的生成源码；测试中由 Creator 产生的改动另列如下。Runtime、vendor、维护中的示例和依赖版本未修改。

## 本地模型配置

| 配置 | 本轮值 |
| --- | --- |
| 单请求输出预算 | 16384，原来 8192 |
| 上下文预算 | 65536 |
| 上下文保留目标 | 12000 |
| 单请求超时 | 120 秒 |
| 温度 | 0.2 |

这些是本地、Git 忽略的 Creator 配置。没有增加累计模型调用或图步骤限制；下述 20 分钟是 QA 观察期限。

## 工程验证

- 新增的本地真实 HTTP/SSE 测试在修复前复现失败；修复后，普通与命名 error 事件均能回退。
- 回退后重复插件 ID、未知插件 ID、额外授权字段仍被拒绝；401 认证错误只请求一次，不回退。
- 三个相关测试文件共 153 项通过。
- Creator 全量 514 项：511 通过、2 个既有失败、1 跳过。既有失败是 Service 声明检查的 Windows 盘符大小写问题，以及文件符号链接权限 EPERM；没有删除或跳过失败来获得通过。
- Node/浏览器类型检查、Creator 构建、离线文档校验和 git diff --check 通过。
- 构建后的 Creator 真实路由调用通过，实际请求输出预算为 16384。该调用第一次 json_schema 请求就成功，未触发回退；回退行为由本地完整 SDK/HTTP/SSE 测试证明。

## 两个原始场景

测试保留原始自然语言问题、AG-UI 数据和初始帮助卡片源码；只在独立临时项目中模拟新插件开始选择。没有模拟源码接管或依赖安装同意。

| 场景 | 原生执行结果 | 工具调用 | 源码变化 |
| --- | --- | ---: | ---: |
| 销售报表 | 1200.6 秒时 QA 正常停止，未自然交付 | 133 | 8 个文件 |
| 任务进度 | 1200.5 秒时 QA 正常停止，未自然交付 | 77 | 0 个文件 |

两轮没有再次发生 Schema 启动错误、日志替换 EPERM 或因模型输出截断而终止。停止事件为 CREATOR_RUN_STOPPED，是 QA 的普通停止动作，不是模型自然结束。

销售报表约 493 秒首次创建插件；约 1001 秒执行静态验证并同步注册表，结构、类型和本地化默认值检查通过。约 1153 秒完成组合变更。最终原生记录为 projectRevision=4、validationRevision=2，仍为 changed-unverified，不能将较早的通过记录套到最后修订上。

销售的 Agent 请求最大输出为 8046 token，摘要最大输出为 6886；没有 length 结束。它生成了实现，但这不能证明调大输出预算是产生改动的唯一原因。

任务进度仍主要停留在读取与检索，未写入源码。更正：重新逐条关联中断、QA 回答和恢复事件后，确认该轮在 622.370 秒提交了新插件方案，628.638 秒获得隔离 QA 的“开始开发”选择，629.407 秒恢复并返回 authorized；此前“未提交新插件确认”的判断不准确。确认之后仍有约 9 分半的观察时间，进行了 30 次读取/查询，没有调用源码创建或编辑工具。其摘要最大输出 8735 token，超过旧输出预算，但仍未完成实施；增大输出预算没有解决实施不收敛。详见 progress-analysis.md。

压缩仍占用大量时间：销售完成 14 次压缩、16 次摘要调用，约 515 秒；任务进度完成 18 次压缩、20 次摘要调用，约 695 秒。两轮自然工作量不同，不据此计算吞吐提升。

## 销售报表的独立验收

第一次 QA 在发消息前失败，尚未发送业务测试事件。核对截图后确认是测试连接设置错误：Creator 预览默认 Mock 覆盖了传给 Agent 的 endpoint，因此该失败不能用来判断报表功能。

纠正方式仅是通过既有 Connection API 明确选择受控 Agent 地址，随后将保留的最终源码放入新的临时 Host 重放验收。没有再次调用模型或修改生成的 Agent UI 源码；所有 Agent UI 源码内容 hash 与原输出完全一致。

最终源码 typecheck 与 build 均通过；受控 Agent 实际收到 3 次运行，注入了正常报表、错误 JSON 和空报表事件。四项浏览器检查均通过：

1. JSON 字符串解析并显示成表格。
2. 按收入排序改变行顺序。
3. 点击某月显示对应订单数。
4. 错误 JSON、空数据不破坏会话，输入区仍可使用。

没有浏览器 pageerror。此结果证明该输出的上述交互可用，但不回填或改写 Creator 的原生交付记录，也不代表任务进度场景通过。

[验收截图](<WORKSPACE>/.agent-ui/creator/windows-tests/schema-fix-20261104/sales-connected-replay/verified.png)

## 清理与证据

原始两轮测试正常关闭。独立重放在关闭浏览器、Vite 和 Agent 服务后，最后删除临时目录时遇到 Windows EBUSY，因此进程退出码为 1；这是清理阶段失败，不是四项行为断言失败。临时目录保留，未强制终止进程树或强制删除目录。已核对没有遗留的 QA 或受管 Creator 进程。

本目录主要证据：report.json、tests-final.log、creator-tests.log、typecheck.log、build.log、route-probe.json、sales.log、progress.log，以及 sales-connected-replay/ 下的 result.json、typecheck.log、build.log、cleanup.json 和截图。两个完整原生运行目录在 report.json 的 scenarios.folder 中，包含事件、脱敏模型元数据、最终源码与 Creator JSONL。
