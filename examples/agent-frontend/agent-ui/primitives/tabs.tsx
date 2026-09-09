import { Tabs as BaseTabs } from "@base-ui/react/tabs";

import { cx } from "../foundation/cx";
import styles from "./tabs.module.css";

export function Tabs({ className, orientation = "horizontal", ...props }: BaseTabs.Root.Props) {
  return (
    <BaseTabs.Root
      {...props}
      orientation={orientation}
      data-slot="tabs"
      className={typeof className === "function"
        ? (state) => cx(styles.root, className(state))
        : cx(styles.root, className)}
    />
  );
}

export function TabsList({ className, ...props }: BaseTabs.List.Props) {
  return (
    <BaseTabs.List
      {...props}
      data-slot="tabs-list"
      className={typeof className === "function"
        ? (state) => cx(styles.list, className(state))
        : cx(styles.list, className)}
    />
  );
}

export function TabsTrigger({ className, ...props }: BaseTabs.Tab.Props) {
  return (
    <BaseTabs.Tab
      {...props}
      data-slot="tabs-trigger"
      className={typeof className === "function"
        ? (state) => cx(styles.trigger, className(state))
        : cx(styles.trigger, className)}
    />
  );
}

export function TabsContent({ className, ...props }: BaseTabs.Panel.Props) {
  return (
    <BaseTabs.Panel
      {...props}
      data-slot="tabs-content"
      className={typeof className === "function"
        ? (state) => cx(styles.content, className(state))
        : cx(styles.content, className)}
    />
  );
}
