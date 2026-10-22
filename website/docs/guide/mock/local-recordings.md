---
title: 使用本地 JSONL 回放
---

# 使用本地 JSONL 回放

本地回放从项目 `.agent-ui/mocks` 读取事件数据。它不是自动录制真实业务流量的功能，文件需要自行准备并脱敏。

## 文件格式

每个非空行是一个 `{ atMs, event }`，atMs 为相对开始的毫秒数，必须非负且不递减。event 需通过当前 AG-UI schema。

```jsonl
{"atMs":0,"event":{"type":"RUN_STARTED","threadId":"demo-thread","runId":"demo-run"}}
{"atMs":50,"event":{"type":"TEXT_MESSAGE_START","messageId":"demo-message","role":"assistant"}}
{"atMs":100,"event":{"type":"TEXT_MESSAGE_CONTENT","messageId":"demo-message","delta":"Hello from a local recording."}}
{"atMs":150,"event":{"type":"TEXT_MESSAGE_END","messageId":"demo-message"}}
{"atMs":200,"event":{"type":"RUN_FINISHED","threadId":"demo-thread","runId":"demo-run"}}
```

文本是测试数据，不是界面默认文案。相同消息和调用使用一致 ID，保留合法开始/结束顺序。

## 限制与加载

当前限制为 8 MiB、20,000 个事件、最大相对时长 24 小时。空行可忽略，非法 JSON、无效事件或时间倒退会报错；不要绕过校验直接向 Runtime 注入。

文件保存后在「示例与回放」刷新本地文件，选择并启动，再连接助理发送。回放速度调整事件间隔，不改变事件语义。

## 脱敏与排障

移除 Cookie、密钥、用户信息、私有文件 URL 与业务内容。错误行按行号检查，保留扩展字段时仍需符合当前 schema。事件有效不保证缺失资源的工程能展示所有卡片。

> 截图待补：本地文件列表、回放选择与格式错误定位；展示脱敏 JSONL 和结果。
