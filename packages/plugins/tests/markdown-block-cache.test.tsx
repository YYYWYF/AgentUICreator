import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { expect, it } from "vitest";
import { createMarkdownBlockCache } from "../src/shared/markdown/markdown-block-cache";
import { createMarkdownParseCache } from "../src/shared/markdown/markdown-parse-cache";

function fixture() {
  const cache = createMarkdownBlockCache();
  const remarkPlugins = [remarkGfm, createMarkdownParseCache({ readOnly: true })];
  const render = (text: string) => renderToStaticMarkup(<ReactMarkdown
    remarkPlugins={remarkPlugins} rehypePlugins={[cache.rehype]} components={cache.components}
  >{text}</ReactMarkdown>);
  return { cache, remarkPlugins, render };
}

it("omits unchanged blocks from JSX conversion while keeping identical HTML", () => {
  const { cache, remarkPlugins } = fixture();
  const widths: number[][] = [];
  const inspect: ReturnType<typeof createMarkdownParseCache> = () => tree => {
    const children = Reflect.get(tree, "children") as object[];
    widths.push(children.map(child => (Reflect.get(child, "children") as unknown[]).length));
  };
  const render = (text: string) => renderToStaticMarkup(<ReactMarkdown
    remarkPlugins={remarkPlugins} rehypePlugins={[cache.rehype, inspect]} components={cache.components}
  >{text}</ReactMarkdown>);
  expect(render("Stable paragraph\n\nTail")).toBe("<p>Stable paragraph</p>\n<p>Tail</p>");
  expect(render("Stable paragraph\n\nTail\n\nNew paragraph")).toBe("<p>Stable paragraph</p>\n<p>Tail</p>\n<p>New paragraph</p>");
  expect(widths).toEqual([[1, 1, 1], [0, 0, 0, 1, 1]]);
});

it.each([
  ["[policy][ref]\n\nTail", "[policy][ref]\n\nTail\n\n[ref]: /policy"],
  ["[policy][ref]\n\n[ref]: /old", "[policy][ref]\n\n[ref]: /new"],
  ["![asset][ref]", "![asset][ref]\n\n[ref]: /asset.png"],
  ["😀 **Text**\n\nTail", "😀 **Text**\n\nTail changed"],
  ["| Type | Days |\n| --- | --- |\n| Leave | 3 |", "| Type | Days |\n| --- | --- |\n| Leave | 3 |\n| Sick | 2 |"],
  ["```ts\nconst days = 3;", "```ts\nconst days = 3;\n```\n\nFinal"],
  ["Note[^a]", "Note[^a]\n\n[^a]: Footnote"],
  ["- [ ] Pending\n\nhttps://example.com", "- [x] Complete\n\nhttps://example.com"],
  ["[unsafe](javascript:alert(1))\n\n<script>unsafe</script>", "Different conversation"],
])("preserves full-document semantics across updates", (before, after) => {
  const { render } = fixture();
  for (const text of [before, before, after, after]) {
    const expected = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>);
    expect(render(text)).toBe(expected);
  }
});

it("keeps interrupted render snapshots independent", () => {
  const { cache, remarkPlugins } = fixture();
  const options = { remarkPlugins, rehypePlugins: [cache.rehype], components: cache.components };
  const first = ReactMarkdown({ ...options, children: "First frame" });
  const second = ReactMarkdown({ ...options, children: "Second frame" });
  expect(renderToStaticMarkup(second)).toBe("<p>Second frame</p>");
  expect(renderToStaticMarkup(first)).toBe("<p>First frame</p>");
});

it("invalidates captured elements when application renderers change", () => {
  const { cache, render, remarkPlugins } = fixture();
  expect(render("Stable text")).toBe("<p>Stable text</p>");
  cache.reset();
  expect(renderToStaticMarkup(<ReactMarkdown
    remarkPlugins={remarkPlugins} rehypePlugins={[cache.rehype]}
    components={{ ...cache.components, p: ({ children }) => <section>{children}</section> }}
  >Stable text</ReactMarkdown>)).toBe("<section>Stable text</section>");
});
