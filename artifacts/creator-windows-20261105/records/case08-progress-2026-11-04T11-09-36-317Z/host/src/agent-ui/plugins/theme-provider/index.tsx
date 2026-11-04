import { ThemeProviderPlugin as Implementation } from "@za38.03/agent-ui-plugins/theme-provider";
import type { ComponentProps } from "react";
export function ThemeProviderPlugin(props: ComponentProps<typeof Implementation>) { return <Implementation {...props} />; }
