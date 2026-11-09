# Feedback 与消息排队

## Feedback

feedback-actions 是 response-footer 中的评价 UI，复用 canonical Conversation Runtime 的选择状态。默认反馈适配器保留当前会话内选择；Agent.feedback 可配置持久化服务，Agent.feedbackAdapter 可提供高级实现，feedback=false 可关闭内置适配器。

评价是应用行为，不发起 Agent 推理或私有 AG-UI feedback 事件。持久化由应用负责，恢复后的历史需包含对应评价元数据；错误通过现有 onError 报告，不能改变 Agent 运行状态或伪造回滚成功。

## 消息排队

默认关闭消息排队。应用可以显式设置 Agent.enableMessageQueue；直接使用 ConversationRuntimeProvider 时对应 enableMessageQueue。队列由上游 Runtime 与 canonical Composer 管理，不新增 Queue Plugin、AppUIModel 状态或本地协议。

队列是当前浏览器 Thread 的短期状态，不是持久化历史。发送、等待、移除、取消以及与 frontend tool/interrupt 的协调都使用现有 Runtime；程序式单次发送继续遵循原有运行互斥。

启用前验证运行中发送、工具执行前后续发、中断、取消、移除和历史切换。浏览器实际结果与单元测试分别报告，不把默认关闭解释成所有竞态已解决。
