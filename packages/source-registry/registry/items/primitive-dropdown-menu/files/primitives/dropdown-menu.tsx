import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps } from "react";

import { useAgentUIRoot } from "../foundation/context";
import { cx } from "../foundation/cx";
import styles from "./dropdown-menu.module.css";

export function DropdownMenu(props: BaseMenu.Root.Props) {
  return <BaseMenu.Root {...props} />;
}

export function DropdownMenuTrigger({ className, ...props }: BaseMenu.Trigger.Props) {
  return (
    <BaseMenu.Trigger
      {...props}
      data-slot="dropdown-menu-trigger"
      className={typeof className === "function"
        ? (state) => cx(styles.trigger, className(state))
        : cx(styles.trigger, className)}
    />
  );
}

export interface DropdownMenuContentProps extends BaseMenu.Popup.Props {
  "data-slot"?: string;
  align?: BaseMenu.Positioner.Props["align"];
  alignOffset?: BaseMenu.Positioner.Props["alignOffset"];
  side?: BaseMenu.Positioner.Props["side"];
  sideOffset?: BaseMenu.Positioner.Props["sideOffset"];
}

export function DropdownMenuContent({
  "data-slot": dataSlot = "dropdown-menu-content",
  align = "start",
  alignOffset = 0,
  className,
  side = "bottom",
  sideOffset = 4,
  ...props
}: DropdownMenuContentProps) {
  const { portalContainer } = useAgentUIRoot();

  return (
    <BaseMenu.Portal container={portalContainer} data-slot="dropdown-menu-portal">
      <BaseMenu.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        data-slot="dropdown-menu-positioner"
        className={styles.positioner}
      >
        <BaseMenu.Popup
          {...props}
          data-slot={dataSlot}
          className={typeof className === "function"
            ? (state) => cx(styles.content, className(state))
            : cx(styles.content, className)}
        />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function DropdownMenuGroup(props: BaseMenu.Group.Props) {
  return <BaseMenu.Group {...props} data-slot="dropdown-menu-group" />;
}

export function DropdownMenuLabel({ className, ...props }: BaseMenu.GroupLabel.Props) {
  return (
    <BaseMenu.GroupLabel
      {...props}
      data-slot="dropdown-menu-label"
      className={typeof className === "function"
        ? (state) => cx(styles.label, className(state))
        : cx(styles.label, className)}
    />
  );
}

export type DropdownMenuItemVariant = "default" | "danger";

export interface DropdownMenuItemProps extends BaseMenu.Item.Props {
  variant?: DropdownMenuItemVariant;
}

export function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: DropdownMenuItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={typeof className === "function"
        ? (state) => cx(styles.item, className(state))
        : cx(styles.item, className)}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: BaseMenu.Separator.Props) {
  return (
    <BaseMenu.Separator
      {...props}
      data-slot="dropdown-menu-separator"
      className={typeof className === "function"
        ? (state) => cx(styles.separator, className(state))
        : cx(styles.separator, className)}
    />
  );
}

export function DropdownMenuCheckboxItem({
  children,
  className,
  ...props
}: BaseMenu.CheckboxItem.Props) {
  return (
    <BaseMenu.CheckboxItem
      {...props}
      data-slot="dropdown-menu-checkbox-item"
      className={typeof className === "function"
        ? (state) => cx(styles.item, styles.selectionItem, className(state))
        : cx(styles.item, styles.selectionItem, className)}
    >
      <BaseMenu.CheckboxItemIndicator
        data-slot="dropdown-menu-checkbox-indicator"
        className={styles.indicator}
      >
        <span aria-hidden="true" className={styles.checkmark} />
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </BaseMenu.CheckboxItem>
  );
}

export function DropdownMenuRadioGroup(props: BaseMenu.RadioGroup.Props) {
  return <BaseMenu.RadioGroup {...props} data-slot="dropdown-menu-radio-group" />;
}

export function DropdownMenuRadioItem({
  children,
  className,
  ...props
}: BaseMenu.RadioItem.Props) {
  return (
    <BaseMenu.RadioItem
      {...props}
      data-slot="dropdown-menu-radio-item"
      className={typeof className === "function"
        ? (state) => cx(styles.item, styles.selectionItem, className(state))
        : cx(styles.item, styles.selectionItem, className)}
    >
      <BaseMenu.RadioItemIndicator
        data-slot="dropdown-menu-radio-indicator"
        className={styles.indicator}
      >
        <span aria-hidden="true" className={styles.radioMark} />
      </BaseMenu.RadioItemIndicator>
      {children}
    </BaseMenu.RadioItem>
  );
}

export function DropdownMenuSub(props: BaseMenu.SubmenuRoot.Props) {
  return <BaseMenu.SubmenuRoot {...props} />;
}

export function DropdownMenuSubTrigger({
  children,
  className,
  ...props
}: BaseMenu.SubmenuTrigger.Props) {
  return (
    <BaseMenu.SubmenuTrigger
      {...props}
      data-slot="dropdown-menu-sub-trigger"
      className={typeof className === "function"
        ? (state) => cx(styles.item, styles.subTrigger, className(state))
        : cx(styles.item, styles.subTrigger, className)}
    >
      {children}
      <span aria-hidden="true" className={styles.subArrow} />
    </BaseMenu.SubmenuTrigger>
  );
}

export function DropdownMenuSubContent(props: DropdownMenuContentProps) {
  return (
    <DropdownMenuContent
      {...props}
      side="inline-end"
      sideOffset={2}
      data-slot="dropdown-menu-sub-content"
    />
  );
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      {...props}
      data-slot="dropdown-menu-shortcut"
      className={cx(styles.shortcut, className)}
    />
  );
}
