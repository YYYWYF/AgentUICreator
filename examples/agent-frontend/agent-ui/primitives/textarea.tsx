import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cx } from "../foundation/cx";
import styles from "./textarea.module.css";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        {...props}
        ref={ref}
        className={cx(styles.root, className)}
      />
    );
  },
);
