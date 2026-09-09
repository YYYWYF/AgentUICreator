import { Switch as BaseSwitch } from "@base-ui/react/switch";

import { cx } from "../foundation/cx";
import styles from "./switch.module.css";

export function Switch({ className, ...props }: BaseSwitch.Root.Props) {
  return (
    <BaseSwitch.Root
      {...props}
      data-slot="switch"
      className={typeof className === "function"
        ? (state) => cx(styles.root, className(state))
        : cx(styles.root, className)}
    >
      <BaseSwitch.Thumb data-slot="switch-thumb" className={styles.thumb} />
    </BaseSwitch.Root>
  );
}
