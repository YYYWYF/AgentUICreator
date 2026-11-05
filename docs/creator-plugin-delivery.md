# Creator Plugin Delivery

Creator 是通用 Coding Agent。交付机制读取实际工程、记录目标与证据、拒绝错误完成声明，不定义另一套固定工作流。生成前端不依赖 Creator 控制面。

## 能力发现

当前 `inspect_ui_capabilities({})` 返回两个 Operator 结果：list_ui_plugins 的 plugins，以及 inspect_ui_services 的 services。它没有 detail/cursor 参数，也不提供正式 Source inventory 或项目组件完整性标记。

正式资源使用 inspect_agent_ui_sources 查询。定位当前编辑 owner 使用 inspect_ui_plugin 或 inspect_ui_edit_context，具体项目组件使用目标文件读取与搜索。目录和文件名只是导航；不能据此声称某个行为已实现，或把部分检查当成能力不存在的证据。

创建新 Plugin 身份前询问一次；修改已有项目插件、增加交互或配套代码直接执行。首次 npm 源码接管另行询问。文件清单不是权限白名单；实现细节和辅助文件变化不重复询问。Service 可选预检返回 planId，不弹开发审批。

## 交付契约

开发确认仅必填 targetPluginId 与 desiredOutcome；可选 deliveryContract 可在确认后补充，用于声明 capability、renderingCategory、placement、lifecycle、dependencies、reusedComponents、verificationMethod 和 interactions；需要实际尺寸断言时包含 geometry。

交付约定留在当前执行中供验证使用，不形成文件审批，不扩展 Runtime manifest。实际 placement 由当前 AppUIModel admission 校验。

| 状态 | 证据 |
| --- | --- |
| planning | 当前任务和交付目标 |
| created | 匹配的 manifest、definition、index |
| registered | 源码已进入 authoring inventory；运行 catalog 只包含 AppUIModel 选中的 Plugin |
| composed | 启用实例与有效父级组合 |
| verified | 当前 revision 的静态、Runtime 及声明交互证据 |
| completed | 本次交付义务全部满足 |
| blocked | 回执列出已保存修改、最后成功阶段与阻碍 |

安装、注册和静态检查不等于已挂载或行为通过。修改后重新核对当前 revision；静态模式只交付静态证据，不声称 Runtime 或浏览器通过。

`validate_creator_changes` 返回本轮改动 Plugin 的 `pluginStates`，区分源码有效性、AppUIModel 选择与运行 catalog 条目。`excluded_not_selected` 表示尚未组合，不应通过修改声明或寻找生成脚本消除。未组合源码的诊断独立返回；本轮引入的目标源码问题仍会使 Creator 校验失败，已有或无关问题保留原有 delta 边界。

## Runtime 与交互验证

inspect_runtime_layout 返回当前 DOM 几何和新鲜度。authoring ref、Runtime instance ID 和 DOM nodeId 不混用。相关 observation 缺失、过期或尺寸不符不能算通过，类型或文本断言也不证明真实外观。

项目 Playwright 交互验证默认关闭。Host 可通过 `CREATOR_BEHAVIOR_VERIFICATION_ENABLED=1` 显式启用，`0` 为关闭；修改后重新启动 Creator。这个开关独立于 `CREATOR_VERIFICATION_MODE`，不关闭静态、类型、构建检查或已启用的 Runtime 观察。关闭时不向模型提供 `verify_ui_plugin_behavior`，交付检查也不要求该测试；回执保留 `interaction: not-run` 和 `interactionPolicy: disabled`，不声称浏览器行为通过。

启用后，verify_ui_plugin_behavior 只运行目标项目已安装的 Playwright executable 和现有配置，不自动安装测试设施、不接受模型提供的 PASS。测试标题为 `[delivery:<pluginId>] <interaction>`；没有交互列表的 browser-test 合同使用 runtime 测试。

退出码、完整报告、全部必需测试、revision 与交互清单 都需匹配。跳过、失败、flaky retry、截断和缺失配置不能成功。缺少验证能力时准确报告，不能回到无关调查或伪称已交付。

相关源码与规则见 [开发决策](creator-plugin-development-decision-contract.md)、[Plugin Authoring](architecture/plugin-authoring-contract.md) 和 [控制面](creator-control-plane-implementation-plan.md)。
