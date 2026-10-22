---
title: 接入附件、语音与反馈适配器
---

# 接入附件、语音与反馈适配器

三个适配器由宿主实现，交给同一个 canonical Runtime。UI 按钮只提供交互，不内置存储、语音识别或反馈数据库。

## 附件

按当前 assistant-ui `AttachmentAdapter` 合同处理选择、准备、上传、取消与消息内容。返回可被当前后端消费的内容，保留 MIME、名称与资源身份。浏览器 file URL 和本地磁盘路径不能作为远端下载 URL。

在生成 `Agent` 上传 `attachmentAdapter`。文件类型、大小、鉴权和上传生命周期由业务决定，失败时保留草稿与可移除状态。

## 语音

实现 `DictationAdapter` 并传 `dictationAdapter`，核对开始、停止、转写回调和资源清理。麦克风权限由浏览器授予，转写由宿主服务提供；卸载与取消时停止设备和订阅。

## 反馈

`ConversationFeedbackAdapter` 接收线程、消息、positive/negative 与可选 comment：

```ts
import type { ConversationFeedbackAdapter } from '@za38.03/agent-ui-runtime';
export const feedbackAdapter: ConversationFeedbackAdapter = {
  async submit(feedback) {
    const response = await fetch('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });
    if (!response.ok) throw new Error('FEEDBACK_SUBMIT_FAILED');
  },
};
```

这是同源认证示例；业务仍需权限、幂等和失败提示。错误码交给产品 locale 显示，不直接作为用户文案。

## 验证

分别检查不可用、准备中、成功、失败、取消、重复操作、历史重放与卸载。`/demo-attachments` 只用于开发演示，不能当作上传后端。

> 截图待补：附件准备/失败与删除、麦克风拒绝/转写、反馈成功与失败，标记模拟适配器。
