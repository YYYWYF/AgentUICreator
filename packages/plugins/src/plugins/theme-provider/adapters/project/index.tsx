import { CanonicalThemeProviderPlugin as Implementation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps } from 'react';
export function ThemeProviderPlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  return <Implementation {...props} />;
}
