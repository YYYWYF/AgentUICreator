import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

import { cx } from "../foundation/cx";
import styles from "./scroll-area.module.css";

type ScrollBarElement = ReactElement<BaseScrollArea.Scrollbar.Props>;

function splitScrollBars(children: ReactNode) {
  const content: ReactNode[] = [];
  const scrollBars: ScrollBarElement[] = [];
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === ScrollBar) {
      scrollBars.push(child as ScrollBarElement);
    } else {
      content.push(child);
    }
  }
  return { content, scrollBars };
}

export function ScrollArea({
  children,
  className,
  ...props
}: BaseScrollArea.Root.Props) {
  const { content, scrollBars } = splitScrollBars(children);
  const hasVerticalBar = scrollBars.some(
    (scrollBar) => (scrollBar.props.orientation ?? "vertical") === "vertical",
  );

  return (
    <BaseScrollArea.Root
      {...props}
      data-slot="scroll-area"
      className={typeof className === "function"
        ? (state) => cx(styles.root, className(state))
        : cx(styles.root, className)}
    >
      <BaseScrollArea.Viewport data-slot="scroll-area-viewport" className={styles.viewport}>
        <BaseScrollArea.Content data-slot="scroll-area-content" className={styles.content}>
          {content}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      {hasVerticalBar ? null : <ScrollBar />}
      {scrollBars}
      <BaseScrollArea.Corner data-slot="scroll-area-corner" className={styles.corner} />
    </BaseScrollArea.Root>
  );
}

export function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: BaseScrollArea.Scrollbar.Props) {
  return (
    <BaseScrollArea.Scrollbar
      {...props}
      orientation={orientation}
      data-slot="scroll-area-scrollbar"
      className={typeof className === "function"
        ? (state) => cx(styles.scrollbar, className(state))
        : cx(styles.scrollbar, className)}
    >
      <BaseScrollArea.Thumb data-slot="scroll-area-thumb" className={styles.thumb} />
    </BaseScrollArea.Scrollbar>
  );
}
