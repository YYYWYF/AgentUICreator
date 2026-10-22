---
title: 定制语言与文案
---

# 定制语言与文案

生成工程使用统一 locale context 和域命名空间，支持 `en-US` / `zh-CN`。Plugin 消费本域消息，纯展示 helper 通过参数接收消息。

仅切换现有中英文界面时，使用[语言配置](../integration/locale-configuration)。本页用于修改翻译、命名空间和项目文案。

## 找到文案 owner

读取生成目录 `agent-ui/i18n` 下的配置、类型、字典和 namespace hook。优先在已有域增加或覆盖文案；新增独立 UI 域时再增加命名空间，不把全部文案塞进 common。

通过 `Agent` 的 `locale` 和 `onLocaleChange` 配合 Host 控制；需要界面切换入口时加入语言切换控件。控制模式下 Host 要更新传入值，不能忽略回调又期待控件保持新语言。示例见[Agent 参数与配置](../integration/agent-options)。

## 修改规则

新文案包括按钮、错误、加载、占位、默认建议和无障碍标签，两种语言都提供相同 key 与占位符。协议 ID、字段、工具名、Slot、状态枚举和持久化名称保持稳定，不按翻译标签分支业务逻辑。

上游 vendor 保持原样。使用公开 props、composition 和产品 adapter 传入文案；不支持的 seam 记录为上游本地化缺口，不在 vendor 中硬改字符串。Agent 消息和业务载荷是数据，不自动翻译。

## 检查

在本仓库维护产品文案时运行 `pnpm check:i18n` 和受影响类型检查；`pnpm audit:ui-copy` 辅助语义审查，不把所有字符串视为违规。外部工程使用自己的 parity 检查与构建。

验证切语言不丢草稿、选择、连接和 Runtime 状态。长英文、中文换行及 screen reader 标签需要分别检查。

> 截图待补：同一 Plugin 中英文的普通、加载、错误和无障碍名称对照，不改协议字段。
