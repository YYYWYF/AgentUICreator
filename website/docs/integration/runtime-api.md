---
title: 对话绑定与适配器参考
---

# 对话绑定与适配器参考

本页用于接入已有会话导航、运行恢复或业务适配器。普通页面先按[Agent 参数与配置](./agent-options)传入配置；生成入口的完整 Props、Host 方法与事件见 [React Host API](./react-host-api)。

## 会话绑定

自定义宿主通过 `ConversationThreadBinding` 连接业务会话身份与已有 Runtime，不为每次选择或每个业务按钮创建新的 Runtime。

| 入口 | 责任 |
| --- | --- |
| `getThreadId` | 提供当前会话身份。 |
| `subscribe` | 订阅业务会话选择变化，并返回清理函数。 |
| `createNewThread` | 创建新的会话身份。 |
| 加载、选择、删除与列表快照 | 按宿主实际支持的能力实现，保持错误与只读状态。 |

`loadThread` 加载历史内容，`activateThread` 同步业务选择；已有宿主实现时避免重复加载或替换运行实例。具体接口以当前包公开类型为准。[历史服务契约](./history-backend)说明加载数据与验证要求。

## 已有会话与运行恢复

业务页面使用 `initialThreadId` 指定打开的会话，通过 `runResumeProvider` 提供恢复能力，最小用法见[打开会话与运行恢复](./conversation-binding)。

刷新恢复需要服务端保存运行身份、状态和对应事件流。加载结果中的 `ConversationRunResume.stream(signal)` 只提供该线程的运行增量，不使用当前选择的全局事件流替代。只读记录不能开放后端无法履行的发送、审批或继续操作。

## 业务适配器

| 适配器 | 宿主负责的内容 |
| --- | --- |
| 附件 | 文件准备、上传、可访问结果与失败处理。 |
| 语音 | 设备权限、识别服务、取消与清理。 |
| 反馈 | 按 threadId、messageId 保存评价与提交结果。 |

反馈适配器的 `submit` 接收 threadId、messageId、positive/negative 和可选 comment。附件与语音使用当前包公开的标准适配器类型，不自行猜测字段或给 `Agent` 添加未声明的参数。实现步骤见[附件、语音与反馈服务](./attachments-dictation-feedback)。

## 直接组装对话 Provider

高级宿主直接使用 `ConversationRuntimeProvider` 时，需要提供 endpoint、threadBinding 和 children，可按当前接口配置 frontendTools、frontendToolUIs、suggestions 与消息队列。生成项目已完成常规组装时，复用已有 Provider 即可。

前端工具的执行授权见[执行接入](./frontend-tools)，工具或数据的展示扩展见[自定义渲染](../customization/custom-renderers)。

> 截图待补：已有业务会话选择、只读历史与可恢复运行的接入对照，展示对应身份和清理结果。
