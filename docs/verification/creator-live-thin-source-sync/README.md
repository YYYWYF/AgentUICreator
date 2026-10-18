# Composer：真实 Creator 薄应用层与源码同步验证

验证入口是 Creator 工作台与真实 Python Creator Agent，使用 Host 配置的外部模型。浏览器通过真实请求提交需求、回答接管问题、操作插件更新页；没有替换页面或拦截模型响应。预览 AG-UI 服务是验证 Host 的本地测试服务，不是外部 Agent 后端。

## 场景

1. 在本地薄应用层传入 rootProps.style，改变内边距、圆角和背景；确认没有 ownership 或 source/。
2. 请求改变内部真实 DOM 顺序，公开参数不能满足后，显示真实 human-input 接管问题并确认。
3. 提取当前安装版本实现，保留应用层，仅切换实现 import；真实模型将操作栏移到输入框上方。
4. 更换本地构建的 Plugins npm tarball（0.0.1 → 0.0.2）。候选版在官方 Composer 适配层加入字数统计，以制造与本地 DOM 顺序定制的真实同文件冲突。该候选版只在临时构建目录生成，未修改工作区的官方发布版本，也未发布公网。
5. 在 Creator 插件更新页查看变更、生成实现同步计划、交给真实模型合并，再返回更新页验证并采用基线。
6. 比较应用层、定义文件和 AppUIModel 字节；检查 DOM 顺序、样式及新增统计功能；执行 Host verify:ui、typecheck、build。

## 证据

最终结果以 verification.json 为准，creator-runs.json 保存本轮真实模型 SSE，update-responses.json 保存更新页请求结果，final-composer/ 保存最终源码。截图 04、06、08、09、10、12、13、14 对应关键步骤。较早失败尝试移到 previous-attempts/，不作为最终通过证据。

这是 Composer 试点验证，不代表全部官方插件已支持薄应用层/接管/同步。未执行原生 Windows 验收；相关路径使用 native path 与逻辑 POSIX 路径分离，回归测试包含 win32 路径和 CRLF 保留检查。

## 本轮修复与验证边界

- Creator 更新页接入已托管 Composer 的实现同步，显示安装包/插件版本、变更记录及 BASE/LOCAL/TARGET，模型合并后再显式验证并采用基线。
- 薄层插槽校验识别参数/函数体内解构后的 rest 转发；如果移除了 renderSlot，仍报告未渲染插槽。
- 接管计划的 applicationChanges 字段登记到严格 Operator 返回协议。
- 提取转换需要同时重定位 type import 和运行时 import；真实模型发现并修复了本地入口中残留的 npm 运行时引用，发布生成器随后改为全量替换，并增加双 import 回归断言。此前关于视觉未变化的绝对定位判断不充分，最终证明入口接线才是关键原因。
- 补齐 Composer portable closure 的 props 类型别名和 composer-support 的三种 props 声明，并独立编译发布快照适配层作为回归检查。
- Creator 接管提示规则明确使用内置确认卡片，不预先重复 ask_user_question。

Operator 定向接管/同步测试（9）、打包源码目录与独立类型编译测试（4）、Python 接管中断恢复测试（10）已通过；Creator 更新页组件测试（3）、其他更新/初始化测试、i18n、相关 typecheck/build 的结果随本轮验证记录保留。未执行全量测试。

额外尝试的旧 Python test_plugin_source_mutation.py 有 25 项失败（与接管测试合跑总计 12 passed / 25 failed），主要在 fixture 缺少 .agent-ui/project.json 时初始化失败；该结果没有计入通过项，也没有扩展修改这些旧测试。本轮 Creator 自身的自动 Runtime 完成卡仍给出 unavailable；浏览器计算样式、DOM 顺序与新功能行为的断言另行记录，不能把两种证据混称为全部验收通过。
