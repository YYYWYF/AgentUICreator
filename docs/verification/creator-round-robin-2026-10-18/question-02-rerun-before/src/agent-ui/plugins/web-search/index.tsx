import { WebSearchPlugin as Implementation } from "@za38.03/agent-ui-plugins/web-search";
import type { ComponentProps } from "react";

export function WebSearchPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
