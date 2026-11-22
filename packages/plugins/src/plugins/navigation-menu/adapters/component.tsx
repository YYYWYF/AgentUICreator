import {
  NavigationMenu, STACK_NAVIGATION_SERVICE, usePluginService, useConversationNavigation,
  type NavigationMenuProps, type StackNavigationService,
} from '@za38.03/agent-ui-plugins';
import './styles.css';
export function NavigationMenuPlugin(props: NavigationMenuProps) {
  const service = usePluginService<StackNavigationService>(STACK_NAVIGATION_SERVICE);
  const navigation = useConversationNavigation();
  return <NavigationMenu {...props} service={props.service ?? service}
    onNewConversation={props.onNewConversation ?? (async () => { await navigation.switchToNewThread(); })} />;
}
