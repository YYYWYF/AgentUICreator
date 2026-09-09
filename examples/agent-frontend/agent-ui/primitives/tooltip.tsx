import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";

import { useAgentUIRoot } from "../foundation/context";
import { cx } from "../foundation/cx";
import styles from "./tooltip.module.css";

export function Tooltip(props: BaseTooltip.Root.Props) {
  return <BaseTooltip.Root {...props} />;
}

export function TooltipTrigger({ className, ...props }: BaseTooltip.Trigger.Props) {
  return (
    <BaseTooltip.Trigger
      {...props}
      data-slot="tooltip-trigger"
      className={cx(styles.trigger, className as string | undefined)}
    />
  );
}

export interface TooltipContentProps extends BaseTooltip.Popup.Props {
  align?: BaseTooltip.Positioner.Props["align"];
  alignOffset?: BaseTooltip.Positioner.Props["alignOffset"];
  side?: BaseTooltip.Positioner.Props["side"];
  sideOffset?: BaseTooltip.Positioner.Props["sideOffset"];
}

export function TooltipContent({
  align = "center",
  alignOffset = 0,
  children,
  className,
  side = "top",
  sideOffset = 6,
  ...props
}: TooltipContentProps) {
  const { portalContainer } = useAgentUIRoot();

  return (
    <BaseTooltip.Portal container={portalContainer} data-slot="tooltip-portal">
      <BaseTooltip.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        data-slot="tooltip-positioner"
        className={styles.positioner}
      >
        <BaseTooltip.Popup
          {...props}
          data-slot="tooltip-content"
          className={cx(styles.content, className as string | undefined)}
        >
          {children}
          <BaseTooltip.Arrow data-slot="tooltip-arrow" className={styles.arrow} />
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
