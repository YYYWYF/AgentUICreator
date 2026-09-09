import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./button.module.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, disabled, size = "md", type = "button", variant = "primary", "data-slot": dataSlot = "button", ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled}
        data-slot={dataSlot}
        data-size={size}
        data-state={disabled ? "disabled" : "default"}
        data-variant={variant}
        className={cx(styles.root, className)}
      />
    );
  },
);
