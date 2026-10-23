import { ChartMessagePlugin as Implementation } from "@za38.03/agent-ui-plugins/chart-message";
import type { ComponentProps } from "react";

export function ChartMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
