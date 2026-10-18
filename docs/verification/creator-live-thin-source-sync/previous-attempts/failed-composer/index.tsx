import { ConversationComposerPlugin as Composer } from "@za38.03/agent-ui-plugins/composer";
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
