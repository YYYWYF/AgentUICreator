# Conversation Quote

conversation-quote 组合在 composer.beforeInput。它使用当前会话的 canonical quote 状态提供选择、预览、移除和发送上下文，不创建独立草稿或持久化缓存。

Runtime 通过当前 concrete thread binding 安装引用生命周期。切换线程、停用或移除 Plugin 时清理其拥有的待发送引用，不通过可变的全局主线程查找回调。关闭产品面板仅隐藏内容，不能卸载并丢失会话状态。

发送沿用已有上下文与编码路径，不重写 AG-UI 协议，不删除历史引用。只读历史保持只读。选择菜单和预览保持在当前主题/Portal 容器内，文案通过统一 locale。

公开 props 和接线以项目薄应用层及实际安装类型为准，默认 npm 实现的定制遵循 [所有权规则](npm-default-plugin-source-ownership.md)。

验证选中、预览、移除、发送、线程切换、停用、只读、附件组合、输入身份以及卸载清理。源码和测试存在不代表浏览器交互或真实 Windows 验收已通过。
