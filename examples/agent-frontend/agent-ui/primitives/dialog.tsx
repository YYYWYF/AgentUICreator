import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { HTMLAttributes } from "react";

import { useAgentUIRoot } from "../foundation/context";
import { cx } from "../foundation/cx";
import styles from "./dialog.module.css";

export function Dialog(props: BaseDialog.Root.Props) {
  return <BaseDialog.Root {...props} />;
}

export function DialogTrigger({ className, ...props }: BaseDialog.Trigger.Props) {
  return (
    <BaseDialog.Trigger
      {...props}
      data-slot="dialog-trigger"
      className={cx(styles.trigger, className as string | undefined)}
    />
  );
}

export function DialogClose({ className, ...props }: BaseDialog.Close.Props) {
  return (
    <BaseDialog.Close
      {...props}
      data-slot="dialog-close"
      className={cx(styles.close, className as string | undefined)}
    />
  );
}

export interface DialogContentProps extends BaseDialog.Popup.Props {
  showCloseButton?: boolean;
}

export function DialogContent({
  children,
  className,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  const { portalContainer } = useAgentUIRoot();

  return (
    <BaseDialog.Portal container={portalContainer} data-slot="dialog-portal">
      <BaseDialog.Backdrop data-slot="dialog-overlay" className={styles.backdrop} />
      <BaseDialog.Viewport data-slot="dialog-viewport" className={styles.viewport}>
        <BaseDialog.Popup
          {...props}
          data-slot="dialog-content"
          className={cx(styles.content, className as string | undefined)}
        >
          {children}
          {showCloseButton ? (
            <BaseDialog.Close
              aria-label="Close"
              data-slot="dialog-close"
              className={styles.defaultClose}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </BaseDialog.Close>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="dialog-header"
      className={cx(styles.header, className)}
    />
  );
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="dialog-footer"
      className={cx(styles.footer, className)}
    />
  );
}

export function DialogTitle({ className, ...props }: BaseDialog.Title.Props) {
  return (
    <BaseDialog.Title
      {...props}
      data-slot="dialog-title"
      className={cx(styles.title, className as string | undefined)}
    />
  );
}

export function DialogDescription({ className, ...props }: BaseDialog.Description.Props) {
  return (
    <BaseDialog.Description
      {...props}
      data-slot="dialog-description"
      className={cx(styles.description, className as string | undefined)}
    />
  );
}
