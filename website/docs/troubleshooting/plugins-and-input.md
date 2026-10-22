---
title: Plugin、附件、语音或输入菜单不可用
---

# Plugin、附件、语音或输入菜单不可用

## 先核对组合

检查准确 Plugin ID、实例 `enabled`、父语义 Slot 和 Registry。renderer 需要实体 scope，不能像静态面板一样放在任意物理区域。不要使用已删除的 assistant-ui-* 别名或 message-footer。

服务型 Plugin 通过消费者产生效果，没有 DOM 是正常的。必需服务缺失、重复 ID 或 capability/cardinality 不匹配应先修组合，不复制 Runtime Context。

## 能力前提

| 功能 | 需要检查 |
| --- | --- |
| 附件 | attachment adapter、文件限制、上传鉴权与准备状态。 |
| 语音 | dictation adapter、浏览器权限、设备和安全上下文。 |
| `@` | mention-source 是否存在、搜索是否返回有效候选。 |
| `/` | slash-command-source 和 action/directive 类型。 |
| 工具/数据卡片 | 精确注册名、payload schema、toolkit/dataMessageUIs。 |
| 反馈 | feedback adapter 与业务提交错误。 |

## 定制导致的缺失

检查应用层是否丢失 `renderSlot`、props 转发、locale 或 Headless 注册字段。npm 公开封装遗漏支持的 seam，应修正封装，不把问题转为必须源码接管。

## 验证

用相关 Mock 覆盖不可用、正常和失败。浏览器重新挂载或加载历史不能重执行工具。无效 payload 应有 Fallback，不显示假的成功卡片。

> 截图待补：能力未配置、权限拒绝、菜单无结果及修复后正确状态。
