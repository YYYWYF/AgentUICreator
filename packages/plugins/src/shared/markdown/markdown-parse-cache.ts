import type { Options } from "react-markdown";

type RemarkPlugin = Extract<NonNullable<Options["remarkPlugins"]>[number], Function>;
type MarkdownProcessor = ThisParameterType<RemarkPlugin>;
type MarkdownParser = NonNullable<MarkdownProcessor["parser"]>;
interface ParseSnapshot {
  scope: object;
  revision: number;
  text: string;
  contextual: boolean;
  tree: ReturnType<MarkdownParser>;
}
const parseSnapshots = new WeakMap<object, ParseSnapshot>();

export function getMarkdownParseSnapshot(file: object): ParseSnapshot | undefined {
  return parseSnapshots.get(file);
}

function hasContextualReferences(tree: ReturnType<MarkdownParser>): boolean {
  const pending: object[] = [tree];
  while (pending.length) {
    const node = pending.pop()!;
    if (["definition", "footnoteDefinition", "footnoteReference", "linkReference", "imageReference"].includes(Reflect.get(node, "type"))) return true;
    const children: unknown = Reflect.get(node, "children");
    if (Array.isArray(children)) pending.push(...children);
  }
  return false;
}

/**
 * Backport the redundant-parse guard from assistant-ui's pinned Markdown
 * renderer through the installed primitive's public remark seam. The old
 * primitive renders deferred/smoothing passes even when their text is equal.
 * Keep one raw parse per presentation instance, before remark/rehype transforms.
 *
 * Reference: assistant-ui a46d6634e7a75eddd85d51415b1a615886d4ad0e,
 * packages/react-markdown/src/primitives/MarkdownText.tsx (MIT).
 */
export function createMarkdownParseCache({ readOnly = false }: { readOnly?: boolean } = {}): RemarkPlugin {
  let previous: ParseSnapshot | undefined;
  const scope = {};
  let revision = 0;

  return function cacheMarkdownParser(this: MarkdownProcessor) {
    const parse = this.parser;
    if (parse === undefined) return;

    this.parser = (text, file) => {
      let snapshot = previous;
      if (snapshot === undefined || snapshot.text !== text) {
        const tree = parse(text, file);
        snapshot = { scope, revision: ++revision, text, tree, contextual: hasContextualReferences(tree) };
      }
      previous = snapshot;
      parseSnapshots.set(file, snapshot);
      // The product's fixed remark-gfm -> remark-rehype chain only reads mdast.
      // Other pipelines retain isolation if their transforms mutate the tree.
      return readOnly ? snapshot.tree : structuredClone(snapshot.tree);
    };
  };
}
