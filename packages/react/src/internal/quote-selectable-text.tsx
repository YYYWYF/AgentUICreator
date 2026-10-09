import { useEffect, useRef } from "react";
import { MarkdownText } from "./adapters/assistant-ui/components/assistant-ui/elements/markdown-text.js";

/** Product boundary markers; the upstream selection algorithm stays unchanged. */
export function QuoteSelectableText() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current!;
    const markControls = () => {
      for (const control of element.querySelectorAll("button, a, input, textarea, select, img, [role=button], [contenteditable=true]")) {
        control.setAttribute("data-aui-quote-selectable", "false");
      }
    };
    markControls();
    const observer = new MutationObserver(markControls);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} data-slot="agent-ui-markdown" data-aui-quote-selectable="true"><MarkdownText /></div>;
}
