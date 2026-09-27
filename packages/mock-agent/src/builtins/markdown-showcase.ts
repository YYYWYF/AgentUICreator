import { defineScenario } from "../scenario.js";

const MARKDOWN_SHOWCASE_CONTENT = `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

普通文本：这是一个 Markdown / GFM 流式展示示例。

**Bold**、*Italic*、~~Strikethrough~~、\`inline code\` 和 [Link](https://example.com)。

> This is a blockquote.
>
> It can contain multiple lines.

- First item
- Second item
  - Nested item
  - Another nested item

1. First
2. Second
3. Third

- [x] Completed task
- [ ] Pending task

---

| Feature | Status | Count |
| --- | :---: | ---: |
| Markdown | Ready | 12 |
| Streaming | Ready | 8 |

Use \`pnpm dev\` to start the project.

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

const longLine = "This deliberately long line demonstrates horizontal scrolling inside the code block while preserving the surrounding message layout and keeping the language label and copy button visible.";
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
    presentation: "assistant-ui Markdown Message",
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
