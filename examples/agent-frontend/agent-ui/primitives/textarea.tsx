import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./textarea.module.css";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ "aria-invalid": ariaInvalid, className, disabled, ...props }, ref) {
    const invalid = ariaInvalid === true || ariaInvalid === "true";
    return (
      <textarea
        {...props}
        ref={ref}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        data-slot="textarea"
        data-state={disabled ? "disabled" : invalid ? "invalid" : "default"}
        className={cx(styles.root, className)}
      />
    );
  },
);
