import type { ComponentProps, ReactNode } from "react";
import type { Components, ExtraProps } from "react-markdown";
import equal from "fast-deep-equal";
import { createMarkdownParseCache, getMarkdownParseSnapshot } from "./markdown-parse-cache.js";
import {
  unstable_memoizeMarkdownComponents as memoizeNativeComponents,
  type MarkdownTextPrimitiveProps,
} from "@assistant-ui/react-markdown";

type MarkdownPlugin = ReturnType<typeof createMarkdownParseCache>;
type SourceSpan = { start: number; end: number; chars: Uint16Array; kind: string };
type Block = {
  tree: unknown; rendered: boolean; content?: ReactNode;
  scope?: object; revision?: number; contextual?: boolean; source?: SourceSpan;
};
type BlockComponent = (props: ExtraProps & { children?: ReactNode }) => ReactNode;
interface MarkdownBlockCache {
  rehype: MarkdownPlugin;
  components: Components & Record<"agent-ui-markdown-block", BlockComponent>;
  reset(): void;
}

function sourceRange(node: unknown): { start: number; end: number; kind: string } | undefined {
  if (node === null || typeof node !== "object") return undefined;
  const item = node as { type?: string; tagName?: string; position?: { start?: { offset?: number }; end?: { offset?: number } } };
  const start = item.position?.start?.offset, end = item.position?.end?.offset;
  if (start === undefined || end === undefined || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return undefined;
  return { start, end, kind: `${item.type}:${item.tagName ?? ""}` };
}

function sameSource(span: SourceSpan | undefined, range: ReturnType<typeof sourceRange>, text: string): boolean {
  if (!span || !range || span.start !== range.start || span.end !== range.end || span.kind !== range.kind || range.end > text.length) return false;
  for (let index = 0; index < span.chars.length; index++) {
    if (span.chars[index] !== text.charCodeAt(range.start + index)) return false;
  }
  return true;
}

/** The legacy code override supplies its pre node through a callback ref.
 * Memoizing that node can retain the previous frame after a fence closes.
 * Preserve native node stripping while allowing current children through. */
export function memoizeMarkdownComponents(
  components: Parameters<typeof memoizeNativeComponents>[0],
): NonNullable<MarkdownTextPrimitiveProps["components"]> {
  const { pre: Pre, ...rest } = components ?? {};
  const memoized = memoizeNativeComponents(rest);
  if (Pre === undefined) return memoized;
  const CurrentPre = Pre;
  function LivePre({ node: _node, ...props }: ComponentProps<"pre"> & ExtraProps) {
    return <CurrentPre {...props} />;
  }
  return { ...memoized, pre: LivePre };
}

/** Cache presentation after the full Markdown semantics have resolved to HAST. */
export function createMarkdownBlockCache(): MarkdownBlockCache {
  const tag = "agent-ui-markdown-block";
  let previous = new Map<number, Block>();
  // Associate each render's wrapper with its own snapshot. Interrupted React
  // renders must not read a newer frame's block through an index-only lookup.
  const snapshots = new WeakMap<object, Block>();

  function CachedBlock({ node, children }: ExtraProps & { children?: ReactNode }) {
    const block = node === undefined ? undefined : snapshots.get(node);
    if (block === undefined) return children;
    if (!block.rendered) {
      block.content = children;
      block.rendered = true;
    }
    return block.content;
  }

  const rehype: MarkdownPlugin = () => (tree, file) => {
    const children: unknown = Reflect.get(tree, "children");
    if (tree.type !== "root" || !Array.isArray(children)) return;
    const snapshot = getMarkdownParseSnapshot(file);
    const next = new Map<number, Block>();
    const wrapped = children.map((node: unknown, index: number) => {
      const old = previous.get(index);
      const range = sourceRange(node);
      const sameScope = snapshot !== undefined && old?.scope === snapshot.scope;
      const unchanged = old !== undefined && (
        (sameScope && old.revision === snapshot!.revision) ||
        (sameScope && !old.contextual && !snapshot!.contextual && sameSource(old.source, range, snapshot!.text)) ||
        equal(old.tree, node)
      );
      const block: Block = unchanged
        ? old
        // Native post-processing can sanitize URLs or escape raw HTML. Retain
        // a pristine comparison tree only for changed blocks, never a full
        // document clone or a serialized fingerprint on every render.
        : { tree: structuredClone(node), rendered: false };
      if (snapshot !== undefined) {
        block.scope = snapshot.scope;
        block.revision = snapshot.revision;
        block.contextual = snapshot.contextual;
        if (!unchanged && range !== undefined && range.end <= snapshot.text.length) {
          // Copy only a changed block's source. Typed arrays cannot retain
          // historical full-document strings through engine substring slices.
          const chars = new Uint16Array(range.end - range.start);
          for (let offset = 0; offset < chars.length; offset++) chars[offset] = snapshot.text.charCodeAt(range.start + offset);
          block.source = { ...range, chars };
        }
      }
      next.set(index, block);
      const wrapper = {
        type: "element",
        tagName: tag,
        properties: {},
        children: block.rendered ? [] : [node],
      };
      snapshots.set(wrapper, block);
      return wrapper;
    });
    previous = next;
    Reflect.set(tree, "children", wrapped);
  };

  const components: Components & Record<typeof tag, typeof CachedBlock> = { [tag]: CachedBlock };
  return {
    rehype,
    components,
    // Changed application renderers must build fresh elements even when the
    // Markdown text is unchanged. Existing native contexts are never replaced.
    reset() { previous = new Map(); },
  };
}
