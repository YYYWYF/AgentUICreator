import { forwardRef, type InputHTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./input.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ "aria-invalid": ariaInvalid, className, disabled, ...props }, ref) {
    const invalid = ariaInvalid === true || ariaInvalid === "true";
    return (
      <input
        {...props}
        ref={ref}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        data-slot="input"
        data-state={disabled ? "disabled" : invalid ? "invalid" : "default"}
        className={cx(styles.root, className)}
      />
    );
  },
);
