import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./separator.module.css";

export type SeparatorOrientation = "horizontal" | "vertical";

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: SeparatorOrientation;
}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  function Separator({ className, orientation = "horizontal", ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        data-orientation={orientation}
        data-slot="separator"
        className={cx(styles.root, className)}
      />
    );
  },
);
