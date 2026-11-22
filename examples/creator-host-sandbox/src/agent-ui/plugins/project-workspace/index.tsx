import { ArrowLeftIcon, FolderKanbanIcon, UsersIcon } from 'lucide-react';
import {
  Badge, Button, Skeleton, STACK_NAVIGATION_SERVICE, useLocaleCode, usePluginService,
  type StackNavigationService,
} from '@za38.03/agent-ui-plugins';
import appUIModel from '../../app-ui.json';
import { getProjectMessages } from '../../application/i18n/messages';
import './styles.css';

// This preview shows the actual right-hand Stack, including the intact chat branch.
const mainStack = appUIModel.root.children[1].child;

export function ProjectWorkspacePlugin() {
  const labels = getProjectMessages(useLocaleCode()).projectWorkspace;
  const service = usePluginService<StackNavigationService>(STACK_NAVIGATION_SERVICE);

  return (
    <section className="project-workspace" data-ui-plugin="project-workspace" data-agent-ui-owned="" aria-label={labels.title}>
      <div className="project-workspace-body">
        <header className="project-workspace-header">
          <div>
            <Badge variant="secondary">{labels.placeholder}</Badge>
            <h1>{labels.title}</h1>
            <p>{labels.description}</p>
          </div>
          <Button variant="outline" onClick={() => service?.selectView('main', 'chat')}>
            <ArrowLeftIcon aria-hidden="true" />{labels.backToChat}
          </Button>
        </header>
        <div className="project-workspace-cards">
          {[
            { title: labels.overview, description: labels.overviewDescription, Icon: FolderKanbanIcon },
            { title: labels.resources, description: labels.resourcesDescription, Icon: UsersIcon },
          ].map(({ title, description, Icon }) => (
            <article className="project-workspace-card" key={title}>
              <Icon className="project-workspace-card-icon" aria-hidden="true" />
              <h2>{title}</h2>
              <p>{description}</p>
              <div className="project-workspace-placeholder" aria-hidden="true">
                <Skeleton /><Skeleton /><Skeleton />
              </div>
            </article>
          ))}
        </div>
        <section className="project-workspace-configuration" aria-label={labels.configuration}>
          <h2>{labels.configuration}</h2>
          <p>{labels.configurationDescription}</p>
          <pre aria-label={labels.configuration}><code>{JSON.stringify({
            type: mainStack.type,
            id: mainStack.id,
            viewIds: mainStack.viewIds,
            keepMounted: mainStack.keepMounted,
          }, null, 2)}</code></pre>
          <details>
            <summary>{labels.source}</summary>
            <pre aria-label={labels.source} tabIndex={0}><code>{JSON.stringify(mainStack, null, 2)}</code></pre>
          </details>
        </section>
      </div>
    </section>
  );
}
