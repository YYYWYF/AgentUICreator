---
title: "语言服务（locale-provider）"
---

# 语言服务（locale-provider）

统一管理助理界面的语言和文案。生成项目默认中文，支持中文和英文。

## 可以调整什么

| 你关心的内容 | 告诉 Creator 什么 |
| --- | --- |
| 默认语言 | 首次打开使用中文还是英文。 |
| 切换入口 | 是否显示语言选择，以及放在哪里。 |
| 界面文案 | 哪段文字需要修改，以及对应的中英文内容。 |
| 与业务页面同步 | 是否沿用页面语言、是否需要刷新后记住选择。 |

## 怎么让 Creator 修改

在 Creator 输入框说明语言和文案需求，例如：

```text
助理首次打开默认使用中文，保留中英文切换入口。
把输入框提示改为“请输入你的业务问题”，
英文改为“Ask a business question”。
保留当前聊天记录和输入草稿，切换语言时不要清空。
```

修改后，切换中英文检查文案，并确认草稿和当前会话仍保留。需要刷新后记住选择时，请单独说明；默认服务不保存这项偏好。

实际操作记录见[语言与文案定制](/guide/adjustments/localization)。

## 手动接入

在使用 `<Agent />` 的位置设置初始语言和文案覆盖：

```tsx
<Agent
  defaultLocale="zh-CN"
  locales={{
    'zh-CN': { composer: { placeholder: '请输入你的业务问题' } },
    'en-US': { composer: { placeholder: 'Ask a business question' } },
  }}
/>
```

`defaultLocale` 只设置初始语言，保留内置切换。业务页面需要控制当前语言时，使用 `locale` 和 `onLocaleChange`：

```tsx
import { useState } from 'react';
import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';
import { Agent } from './agent-ui';

export function App() {
  const [locale, setLocale] = useState<AgentUILocaleCode>('zh-CN');
  return <Agent locale={locale} onLocaleChange={setLocale} />;
}
```

以上导入假设代码位于 `src/App.tsx`、生成目录为 `src/agent-ui/`。只传固定 `locale` 而不更新它，界面会保持指定语言。

文案覆盖保留中英文对应；已有覆盖按字段合并，避免丢失原文案。更多说明见[样式与文案开发](/development/styling-and-localization)。

