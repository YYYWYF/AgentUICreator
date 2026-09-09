import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";

import { cx } from "../foundation/cx";
import styles from "./collapsible.module.css";

export function Collapsible({ className, ...props }: BaseCollapsible.Root.Props) {
  return (
    <BaseCollapsible.Root
      {...props}
      data-slot="collapsible"
      className={typeof className === "function"
        ? (state) => cx(styles.root, className(state))
        : cx(styles.root, className)}
    />
  );
}

export function CollapsibleTrigger({ className, ...props }: BaseCollapsible.Trigger.Props) {
  return (
    <BaseCollapsible.Trigger
      {...props}
      data-slot="collapsible-trigger"
      className={typeof className === "function"
        ? (state) => cx(styles.trigger, className(state))
        : cx(styles.trigger, className)}
    />
  );
}

export function CollapsibleContent({ className, ...props }: BaseCollapsible.Panel.Props) {
  return (
    <BaseCollapsible.Panel
      {...props}
      data-slot="collapsible-content"
      className={typeof className === "function"
        ? (state) => cx(styles.content, className(state))
        : cx(styles.content, className)}
    />
  );
}
