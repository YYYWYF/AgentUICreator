import { ConversationComposerPlugin as Composer } from "./source/index";
import type { ComponentProps } from "react";

export function ConversationComposerPlugin({ rootProps, ...rest }: ComponentProps<typeof Composer>) {
  return (
    <Composer
      {...rest}
      rootProps={{
        ...rootProps,
        style: {
          ...rootProps?.style,
          padding: 12,
          borderRadius: 20,
          backgroundColor: "#f3e8ff",
        },
      }}
    />
  );
}
