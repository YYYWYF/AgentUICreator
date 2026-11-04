import { LocaleProviderPlugin as Implementation } from "@za38.03/agent-ui-plugins/locale-provider";
import type { ComponentProps } from "react";
export function LocaleProviderPlugin(props: ComponentProps<typeof Implementation>) { return <Implementation {...props} />; }
