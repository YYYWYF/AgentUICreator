import { Popover as BasePopover } from "@base-ui/react/popover";
import type { HTMLAttributes } from "react";

import { useAgentUIRoot } from "../foundation/context";
import { cx } from "../foundation/cx";
import styles from "./popover.module.css";

export function Popover(props: BasePopover.Root.Props) {
  return <BasePopover.Root {...props} />;
}

export function PopoverTrigger({ className, ...props }: BasePopover.Trigger.Props) {
  return (
    <BasePopover.Trigger
      {...props}
      data-slot="popover-trigger"
      className={cx(styles.trigger, className as string | undefined)}
    />
  );
}

export interface PopoverContentProps extends BasePopover.Popup.Props {
  anchor?: BasePopover.Positioner.Props["anchor"];
  align?: BasePopover.Positioner.Props["align"];
  alignOffset?: BasePopover.Positioner.Props["alignOffset"];
  side?: BasePopover.Positioner.Props["side"];
  sideOffset?: BasePopover.Positioner.Props["sideOffset"];
}

export function PopoverContent({
  anchor,
  align = "center",
  alignOffset = 0,
  className,
  side = "bottom",
  sideOffset = 6,
  ...props
}: PopoverContentProps) {
  const { portalContainer } = useAgentUIRoot();

  return (
    <BasePopover.Portal container={portalContainer} data-slot="popover-portal">
      <BasePopover.Positioner
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        data-slot="popover-positioner"
        className={styles.positioner}
      >
        <BasePopover.Popup
          {...props}
          data-slot="popover-content"
          className={cx(styles.content, className as string | undefined)}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export function PopoverHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="popover-header"
      className={cx(styles.header, className)}
    />
  );
}

export function PopoverTitle({ className, ...props }: BasePopover.Title.Props) {
  return (
    <BasePopover.Title
      {...props}
      data-slot="popover-title"
      className={cx(styles.title, className as string | undefined)}
    />
  );
}

export function PopoverDescription({ className, ...props }: BasePopover.Description.Props) {
  return (
    <BasePopover.Description
      {...props}
      data-slot="popover-description"
      className={cx(styles.description, className as string | undefined)}
    />
  );
}

export function PopoverClose({ className, ...props }: BasePopover.Close.Props) {
  return (
    <BasePopover.Close
      {...props}
      data-slot="popover-close"
      className={cx(styles.close, className as string | undefined)}
    />
  );
}
