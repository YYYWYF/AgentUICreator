import { useAgentUILocale } from "@agent-ui/react";
import { AgentMount } from "./AgentMount";



export function App() {
  const localeMessages = useAgentUILocale();
  const milestones = [
  { name: localeMessages.examples.userInterviews, date: localeMessages.examples.september12, progress: localeMessages.examples.completed, done: true },
  { name: localeMessages.examples.interactivePrototype, date: localeMessages.examples.september19, progress: localeMessages.examples.inProgress, done: false },
  { name: localeMessages.examples.developmentHandoff, date: localeMessages.examples.october3, progress: localeMessages.examples.notStarted, done: false },
];
  return (
    <div className="split-workspace">
      <main className="document-pane">
        <header className="app-bar"><div className="app-brand"><span className="app-brand-icon">A</span> atlas <span className="app-brand-divider">/</span>  {localeMessages.examples.projectSpace}</div><div className="app-user">{localeMessages.examples.jiayiLin} <span>{localeMessages.examples.lin}</span></div></header>
        <div className="document-scroll">
          <div className="breadcrumbs">{localeMessages.examples.projects} <span>/</span>  {localeMessages.examples.productDesign} <span>/</span>  {localeMessages.examples.documents}</div>
          <div className="document-heading"><div><span className="document-tag">{localeMessages.examples.projectDocument}</span><h1>{localeMessages.examples.nextGenerationWorkbench}</h1><p>{localeMessages.examples.aClearerSmootherCollaborationExperienceForYour}</p></div><button type="button">{localeMessages.examples.shareDocument}</button></div>
          <div className="document-meta"><span className="meta-avatar">{localeMessages.examples.lin}</span><span>{localeMessages.examples.jiayiLin}</span><span>·</span><span>{localeMessages.examples.updatedSeptember24}</span><span className="meta-status">{localeMessages.examples.editing}</span></div>
          <article className="document-card"><div className="section-number">{localeMessages.examples.section01ProjectOverview}</div><h2>{localeMessages.examples.whatProblemAreWeSolving}</h2><p>{localeMessages.examples.teamInformationIsSpreadAcrossToolsPeople}</p><div className="callout"><span>✦</span><p>{localeMessages.examples.designPrincipleShowImportantInformationWhenIt}</p></div></article>
          <article className="document-card"><div className="section-number">{localeMessages.examples.section02DeliveryPlan}</div><h2>{localeMessages.examples.upcomingMilestones}</h2><div className="milestones">{milestones.map((item) => <div className="milestone" key={item.name}><span className={item.done ? "milestone-dot done" : "milestone-dot"} /><strong>{item.name}</strong><span>{item.date}</span><small>{item.progress}</small></div>)}</div></article>
          <article className="document-card"><div className="section-number">{localeMessages.examples.section03Notes}</div><h2>{localeMessages.examples.questionsToDiscuss}</h2><p>{localeMessages.examples.howCanTheAssistantHelpUsersExplore}</p></article>
        </div>
      </main>
      <aside className="agent-pane" aria-label={localeMessages.examples.embeddedAssistant}><AgentMount /></aside>
    </div>
  );
}
