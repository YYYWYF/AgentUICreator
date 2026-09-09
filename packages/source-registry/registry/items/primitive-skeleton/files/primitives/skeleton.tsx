import { forwardRef, type HTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./skeleton.module.css";

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Skeleton({ "aria-hidden": ariaHidden = true, className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        aria-hidden={ariaHidden}
        data-slot="skeleton"
        className={cx(styles.root, className)}
      />
    );
  },
);
