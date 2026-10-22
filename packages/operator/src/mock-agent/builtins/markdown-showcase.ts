import { defineScenario } from "../scenario.js";

const MARKDOWN_SHOWCASE_CONTENT = `# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题

普通文本：这是一个 Markdown / GFM 流式展示示例。

**加粗**、*斜体*、~~删除线~~、\`行内代码\` 和 [链接](https://example.com)。

> 这是一段引用。
>
> 引用内容可以分成多行。

- 第一项
- 第二项
  - 嵌套项
  - 另一个嵌套项

1. 第一项
2. 第二项
3. 第三项

- [x] 已完成的任务
- [ ] 待处理的任务

---

| 功能 | 状态 | 数量 |
| --- | :---: | ---: |
| Markdown | 就绪 | 12 |
| 流式输出 | 就绪 | 8 |

运行 \`pnpm dev\` 启动项目。

\`\`\`ts
type Agent = {
  id: string;
  status: "running" | "done";
};

export function createAgent(id: string): Agent {
  return {
    id,
    status: "running",
  };
}

const longLine = "这是一段特意加长的文本，用来展示代码块中的横向滚动效果，同时保持周围消息布局稳定，并确保语言标签和复制按钮仍然可见。";
\`\`\`

\`\`\`json
{
  "status": "ready",
  "count": 3
}
\`\`\`
`;

export const markdownShowcaseScenario = defineScenario({
  id: "markdown-showcase",
  title: "Markdown Showcase",
  description: "展示 Markdown / GFM 常见文本类型及代码块的流式渲染。",
  category: "basics",
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "Markdown Text Streaming",
    presentation: "Agent UI Markdown Message",
    eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
  },
  steps: [
    {
      type: "message",
      text: MARKDOWN_SHOWCASE_CONTENT,
      intervalMs: 10,
    },
  ],
});
