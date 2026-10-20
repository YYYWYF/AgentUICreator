import { SourceCitationsMessagePlugin as Implementation } from "@za38.03/agent-ui-plugins/source-citations-message";
import type { ComponentProps } from "react";

export function SourceCitationsMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
