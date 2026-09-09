import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./button.module.css";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, type = "button", ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={cx(styles.root, className)}
      />
    );
  },
);
