import {
  Button, STACK_NAVIGATION_SERVICE, useLocaleCode, usePluginService,
  type StackNavigationService,
} from '@za38.03/agent-ui-plugins';
import { getProjectMessages } from '../../application/i18n/messages';
import './styles.css';

export function ProjectWorkspacePlugin() {
  const labels = getProjectMessages(useLocaleCode()).projectWorkspace;
  const service = usePluginService<StackNavigationService>(STACK_NAVIGATION_SERVICE);

  return (
    <section className="project-workspace" data-ui-plugin="project-workspace" data-agent-ui-owned="" aria-label={labels.title}>
      <div className="project-workspace-body">
        <h1>{labels.title}</h1>
        <p>{labels.description}</p>
        <Button variant="outline" onClick={() => service?.selectView('main', 'chat')}>
          {labels.backToChat}
        </Button>
      </div>
    </section>
  );
}
