import { NavigationMenuPlugin as Implementation } from '@za38.03/agent-ui-plugins/navigation-menu';
import type { ComponentProps } from 'react';
export function NavigationMenuPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation presentation='toolbar' {...props} />;
}
