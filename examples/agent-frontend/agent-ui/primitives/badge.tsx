import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./badge.module.css";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <span
      {...props}
      ref={ref}
      data-slot="badge"
      data-variant={variant}
      className={cx(styles.root, className)}
    />
  );
});
