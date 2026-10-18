import { ConversationComposerPlugin as Composer } from "./source/index";
import type { ComponentProps } from "react";

export function ConversationComposerPlugin(props: ComponentProps<typeof Composer>) {
  return (
    <Composer
      {...props}
      rootProps={{
        ...props.rootProps,
        style: {
          ...props.rootProps?.style,
          padding: 12,
          borderRadius: 20,
          backgroundColor: "#f3e8ff",
        },
      }}
    />
  );
}
