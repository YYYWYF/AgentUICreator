import { useAgentUILocale } from "@agent-ui/react";
import { AgentMount } from "./AgentMount";



export function App() {
  const localeMessages = useAgentUILocale();
  const tasks = [
  { title: localeMessages.examples.organizeCustomerFeedback, project: localeMessages.examples.productExperience, date: localeMessages.examples.today, status: localeMessages.examples.inProgress },
  { title: localeMessages.examples.updateTheQuarterlyRoadmap, project: localeMessages.examples.planning, date: localeMessages.examples.tomorrow, status: localeMessages.examples.pending },
  { title: localeMessages.examples.prepareFridaySDesignReview, project: localeMessages.examples.designSystem, date: localeMessages.examples.friday, status: localeMessages.examples.pending },
];
  return (
    <>
      <div className="workspace-shell">
        <aside className="sidebar" aria-label={localeMessages.examples.workspaceNavigation}>
          <div className="brand"><span className="brand-mark">N</span><span>northstar</span></div>
          <div className="workspace-label">{localeMessages.examples.myWorkspace}</div>
          <nav>
            <a className="active" href="#overview">⌂ <span>{localeMessages.examples.overview}</span></a>
            <a href="#tasks">☷ <span>{localeMessages.examples.task}</span></a>
            <a href="#activity">◷ <span>{localeMessages.examples.activity}</span></a>
          </nav>
          <div className="sidebar-foot"><span className="avatar">{localeMessages.examples.lin}</span><span>{localeMessages.examples.jiayiLin}<small>{localeMessages.examples.teamWorkspace}</small></span></div>
        </aside>
        <main className="workspace-main" id="overview">
          <header className="topbar"><span>{localeMessages.examples.workspaceOverview}</span><span className="topbar-date">{localeMessages.examples.september2026}</span></header>
          <div className="content">
            <div className="eyebrow">{localeMessages.examples.fridayWorkOverview}</div>
            <h1>{localeMessages.examples.goodMorningJiayi} <span aria-hidden="true">☀</span></h1>
            <p className="intro">{localeMessages.examples.startYourDayHereStayOnTop}</p>
            <div className="stats" aria-label={localeMessages.examples.workStatistics}>
              <article><span>{localeMessages.examples.activeProjects}</span><strong>04</strong><small>{localeMessages.examples.sameAsLastWeek}</small></article>
              <article><span>{localeMessages.examples.tasksToComplete}</span><strong>12</strong><small>{localeMessages.examples.section3DueThisWeek}</small></article>
              <article><span>{localeMessages.examples.teamUpdates}</span><strong>08</strong><small>{localeMessages.examples.section2NewToday}</small></article>
            </div>
            <section className="task-section" id="tasks">
              <div className="section-title"><div><span className="eyebrow">{localeMessages.examples.nextSteps}</span><h2>{localeMessages.examples.upcomingTasks}</h2></div><a href="#tasks">{localeMessages.examples.viewAll}</a></div>
              <div className="task-list">
                {tasks.map((task) => <article className="task-row" key={task.title}><span className="task-check" aria-hidden="true" /><div><strong>{task.title}</strong><small>{task.project}</small></div><span className="task-date">{task.date}</span><span className="task-status">{task.status}</span></article>)}
              </div>
            </section>
            <section className="note-card" id="activity"><div><span className="eyebrow">{localeMessages.examples.teamTip}</span><h2>{localeMessages.examples.turnIdeasIntoActionFaster}</h2><p>{localeMessages.examples.letYourAssistantOrganizeRepetitiveWorkSo}</p></div><span className="note-symbol" aria-hidden="true">✦</span></section>
          </div>
        </main>
      </div>
      <AgentMount />
    </>
  );
}
