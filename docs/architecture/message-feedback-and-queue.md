# Feedback

## Feedback

feedback-actions 是 response-footer 中的评价 UI，复用 canonical Conversation Runtime 的选择状态。默认反馈适配器保留当前会话内选择；Agent.feedback 可配置持久化服务，Agent.feedbackAdapter 可提供高级实现，feedback=false 可关闭内置适配器。

评价是应用行为，不发起 Agent 推理或私有 AG-UI feedback 事件。持久化由应用负责，恢复后的历史需包含对应评价元数据；错误通过现有 onError 报告，不能改变 Agent 运行状态或伪造回滚成功。
