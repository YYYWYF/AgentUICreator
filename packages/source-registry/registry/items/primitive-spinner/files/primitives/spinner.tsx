import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./spinner.module.css";

export type SpinnerProps = HTMLAttributes<HTMLSpanElement>;

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(
  function Spinner({ "aria-label": ariaLabel, className, role, ...props }, ref) {
    const announced = ariaLabel !== undefined;
    return (
      <span
        {...props}
        ref={ref}
        role={announced ? role ?? "status" : role}
        aria-hidden={announced ? undefined : true}
        aria-label={ariaLabel}
        data-slot="spinner"
        data-state="loading"
        className={cx(styles.root, className)}
      />
    );
  },
);
