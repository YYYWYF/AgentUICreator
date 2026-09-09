import { forwardRef, type LabelHTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./label.module.css";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  disabled?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  function Label({ className, disabled = false, ...props }, ref) {
    return (
      <label
        {...props}
        ref={ref}
        aria-disabled={disabled || undefined}
        data-slot="label"
        data-state={disabled ? "disabled" : "default"}
        className={cx(styles.root, className)}
      />
    );
  },
);
