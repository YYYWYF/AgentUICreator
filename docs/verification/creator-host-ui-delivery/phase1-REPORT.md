# 宿主 UI 选型证据闭环修复

日期：2026-10-08。基线：`95079462447ae37f54de96c5f64b80df66a4e177`（dev）。

遵照用户最后指令“做完推送，不要验收”，本次完成方案第一阶段的实现、确定性回归和推送；第二阶段真实 Creator / 浏览器验收未执行，不创建验收成功提交，不宣称功能签收或仓库发布通过。

## 实现

- `create-plugin` 的 `panel` / `semantic-slot` 计划必须提供 `componentBasisRefs`，且至少包含页面、组件或 UI 使用入口的源码类型文件。只有 package.json、JSON 配置、样式或声明文件不满足入口要求。这是结构性事实约束，不解析 import、统计包名或替 AI 判断组件库。
- 复用现有 `_component_hashes()`、proposal hashes 和 `_assert_basis_fresh()`。新插件依据在计划准备时固定内容哈希，恢复开发授权及首次创建写入前复核。依据删除、修改、依赖变化、符号链接改指向均要求刷新方案。
- 复用 Creator 现有读取路径策略，校验请求路径及解析后的真实路径。拒绝工程外文件、缺失文件、目录、路径穿越、环境文件和 node_modules / 构建产物等禁读位置。继续支持工程虚拟路径及既有 sourceRoot 逻辑路径。
- Application / headless / 无交付契约的既有非目标入口不增加强制依据要求；已有能力扩展、条件请求复用已有资源不被新建视觉插件约束误拦截。适配组件的原有依据约束保留。
- Skill 和现有 composition reference 明确使用 `uiScope`、`componentBasisRefs`、`deliveryContract.reusedComponents` 记录 UI 体系、真实 imports、源码、Provider/主题及其他体系未选原因。负面调查也是合法计划，但不免除实际调查依据。没有新增 Schema、工具、UI Adapter 或库选择服务，也没有改模型默认配置、预算、超时、重试或 P0 完成门。

文件存在、哈希固定和源码后缀检查不能证明源码内容与业务相关，也不能证明 Creator 的语义选型正确；这些仍需真实生成代码和产品验收。

## 必要代码检查

新增测试：`test_plugin_development_ui_basis.py`，**33 passed**。覆盖 panel / semantic-slot 缺少依据、仅元数据或样式、路径边界和禁读位置、哈希、授权恢复、首次写入前失效及刷新、符号链接、Antd / 自研混合 / 无合适组件的计划、非目标入口、条件复用、既有适配与无关文件变化。组件库场景测试仅验证 Host 接受有事实依据的计划，不模拟或证明模型的选择正确。

相关授权回归：`test_plugin_development_authority.py`、`test_plugin_development_golden.py`、`test_plugin_development_server.py`，修改前后均 **17 passed / 60 failed**，失败名称完全相同。

P0 扩大回归：`test_creator_validation.py`、`test_creator_validation_differential.py`、`test_validation_command_runner.py`、`test_plugin_delivery.py`、`test_recovery_completion.py`、`test_debugging_completion.py`、`test_domain_write_agent.py`，当前与独立导出的基线源码均 **124 passed / 32 failed**，失败名称完全相同。历史测试未改，也未为旧断言调整无关生产逻辑。

完整失败名称、基线计数和当前计数保存在 `regression-comparison.json`，pytest 原始概要输出在 `checks/`。基线授权回归在编辑前运行；P0 基线以 `git archive HEAD` 导出 Python 源码、Skill、contracts 及必要工作区元数据，用同一 Python 环境和未修改的测试运行。初始化时缺少合同资源定位元数据的收集失败已补齐导出环境后重跑，未改生产行为。

`pnpm check:i18n`、Python compileall 和修改文件 whitespace 检查通过。`node packages/react/scripts/check-assistant-ui-upstream.mjs` 返回 `assistant-ui upstream-owned Elements: OK`。此次提交无 vendor、AG-UI、Runtime、Plugin 协议、官方插件 ownership 或依赖变更；未运行完整升级和发布 gate。工作区其他已有改动不纳入本提交。

复现新增测试：

```sh
PYTHONPATH=packages/creator-python packages/creator-python/.venv/bin/python -m pytest packages/creator-python/tests/test_plugin_development_ui_basis.py -q
```

## 未执行的产品验收

| 场景 | 状态 |
| --- | --- |
| B：Ant Design 5 真实 Creator 生成、挂载、验证、交付 | NOT_RUN：用户要求不验收 |
| A：自研 Design System 真实生成与交付 | NOT_RUN：用户要求不验收 |
| C：混合组件库真实生成与交付 | NOT_RUN：用户要求不验收 |
| A/B 明暗 × 桌面/窄视图、输入/添加/弹层、Portal/Focus/隔离 | NOT_RUN：用户要求不验收 |

没有本次模型调用日志、真实开发计划、生成插件 diff/import 证据、最终 revision 交付回执、浏览器交互记录或截图。既有 Host 基线截图不充当生成插件截图。未排查或重跑 MiMo 超时/网络问题，未用 Fake Model 或手写插件冒充 Creator 成果。

## 独立 CI 修复清单

沿用方案和既有记录中的待查项，不在此次修复内处理，也未重新运行 GitHub Actions 来确认当前状态：

- 包入口解析失败。
- `@agent-ui/plugins` 缺失。
- Host 初始化与官方 Composer 身份相关问题。
- 视觉断言失败。

实现及确定性新增测试完成，不等于真实 UI 智能复用产品验收或整个仓库可发布。
