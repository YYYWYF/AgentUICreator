import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { ComponentProps } from "react";

import { cx } from "../foundation/cx";
import styles from "./avatar.module.css";

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps extends BaseAvatar.Root.Props {
  size?: AvatarSize;
}

export function Avatar({ className, size = "md", ...props }: AvatarProps) {
  return (
    <BaseAvatar.Root
      {...props}
      data-slot="avatar"
      data-size={size}
      className={typeof className === "function"
        ? (state) => cx(styles.root, className(state))
        : cx(styles.root, className)}
    />
  );
}

export function AvatarImage({ className, ...props }: BaseAvatar.Image.Props) {
  return (
    <BaseAvatar.Image
      {...props}
      data-slot="avatar-image"
      className={typeof className === "function"
        ? (state) => cx(styles.image, className(state))
        : cx(styles.image, className)}
    />
  );
}

export function AvatarFallback({ className, ...props }: BaseAvatar.Fallback.Props) {
  return (
    <BaseAvatar.Fallback
      {...props}
      data-slot="avatar-fallback"
      className={typeof className === "function"
        ? (state) => cx(styles.fallback, className(state))
        : cx(styles.fallback, className)}
    />
  );
}

export function AvatarBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      {...props}
      data-slot="avatar-badge"
      className={cx(styles.badge, className)}
    />
  );
}
