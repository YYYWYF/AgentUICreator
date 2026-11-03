# Creator Plugin Delivery

Creator 是通用 Coding Agent。交付机制读取实际工程、记录目标与证据、拒绝错误完成声明，不定义另一套固定工作流。生成前端不依赖 Creator 控制面。

## 能力发现

当前 `inspect_ui_capabilities({})` 返回两个 Operator 结果：list_ui_plugins 的 plugins，以及 inspect_ui_services 的 services。它没有 detail/cursor 参数，也不提供正式 Source inventory 或项目组件完整性标记。

正式资源使用 inspect_agent_ui_sources 查询。定位当前编辑 owner 使用 inspect_ui_plugin 或 inspect_ui_edit_context，具体项目组件使用目标文件读取与搜索。目录和文件名只是导航；不能据此声称某个行为已实现，或把部分检查当成能力不存在的证据。

新增 Plugin 的开发方案要求已有 Plugin/工程与正式 Source 的实际检查，以及当前已读组件依据。直接委托开发不重复询问是否开发；Service 和源码接管仍保留自己的具体授权。

## 交付契约

prepare_ui_plugin_development.deliveryContract 声明 capability、renderingCategory、placement、lifecycle、dependencies、reusedComponents、verificationMethod 和 interactions；需要实际尺寸断言时包含 geometry。

方案参与项目、线程、任务和内容 scope 绑定，不扩展 Runtime manifest。实际 placement 由当前 AppUIModel admission 校验。

| 状态 | 证据 |
| --- | --- |
| planning | 当前任务和交付目标 |
| created | 匹配的 manifest、definition、index |
| registered | 生成 Registry 的引用；正式 Source 有对应来源记录 |
| composed | 启用实例与有效父级组合 |
| verified | 当前 revision 的静态、Runtime 及声明交互证据 |
| completed | 本次交付义务全部满足 |
| blocked | 回执列出已保存修改、最后成功阶段与阻碍 |

安装、注册和静态检查不等于已挂载或行为通过。修改后重新核对当前 revision；静态模式只交付静态证据，不声称 Runtime 或浏览器通过。

## Runtime 与交互验证

inspect_runtime_layout 返回当前 DOM 几何和新鲜度。authoring ref、Runtime instance ID 和 DOM nodeId 不混用。相关 observation 缺失、过期或尺寸不符不能算通过，类型或文本断言也不证明真实外观。

verify_ui_plugin_behavior 只运行目标项目已安装的 Playwright executable 和现有配置，不自动安装测试设施、不接受模型提供的 PASS。测试标题为 `[delivery:<pluginId>] <interaction>`；没有交互列表的 browser-test 合同使用 runtime 测试。

退出码、完整报告、全部必需测试、revision 与 proposal scope 都需匹配。跳过、失败、flaky retry、截断和缺失配置不能成功。缺少验证能力时准确报告，不能回到无关调查或伪称已交付。

相关源码与规则见 [开发决策](creator-plugin-development-decision-contract.md)、[Plugin Authoring](architecture/plugin-authoring-contract.md) 和 [控制面](creator-control-plane-implementation-plan.md)。
