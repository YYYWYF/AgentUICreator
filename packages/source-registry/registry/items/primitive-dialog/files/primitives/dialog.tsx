import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";

import { useAgentUIRoot } from "../foundation/context";
import styles from "./dialog.module.css";

export interface DialogProps
  extends Omit<ComponentProps<typeof BaseDialog.Root>, "children"> {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  closeLabel?: ReactNode;
}

export function Dialog({
  trigger,
  title,
  description,
  children,
  closeLabel = "Close",
  ...rootProps
}: DialogProps) {
  const { portalContainer } = useAgentUIRoot();

  return (
    <BaseDialog.Root {...rootProps}>
      <BaseDialog.Trigger className={styles.trigger}>{trigger}</BaseDialog.Trigger>
      <BaseDialog.Portal container={portalContainer}>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Viewport className={styles.viewport}>
          <BaseDialog.Popup className={styles.popup}>
            <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
            {description === undefined ? null : (
              <BaseDialog.Description className={styles.description}>
                {description}
              </BaseDialog.Description>
            )}
            {children}
            <BaseDialog.Close className={styles.close}>{closeLabel}</BaseDialog.Close>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
