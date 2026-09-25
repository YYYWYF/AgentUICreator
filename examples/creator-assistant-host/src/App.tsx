import { AgentMount } from "./AgentMount";

const tasks = [
  { title: "整理客户反馈", project: "产品体验", date: "今天", status: "进行中" },
  { title: "更新季度路线图", project: "规划", date: "明天", status: "待处理" },
  { title: "准备周五设计评审", project: "设计系统", date: "周五", status: "待处理" },
];

export function App() {
  return (
    <>
      <div className="workspace-shell">
        <aside className="sidebar" aria-label="工作区导航">
          <div className="brand"><span className="brand-mark">N</span><span>northstar</span></div>
          <div className="workspace-label">我的工作区</div>
          <nav>
            <a className="active" href="#overview">⌂ <span>总览</span></a>
            <a href="#tasks">☷ <span>任务</span></a>
            <a href="#activity">◷ <span>动态</span></a>
          </nav>
          <div className="sidebar-foot"><span className="avatar">林</span><span>林嘉怡<small>团队工作区</small></span></div>
        </aside>
        <main className="workspace-main" id="overview">
          <header className="topbar"><span>工作区 / 总览</span><span className="topbar-date">2026 年 9 月</span></header>
          <div className="content">
            <div className="eyebrow">星期五 · 工作概览</div>
            <h1>早上好，嘉怡 <span aria-hidden="true">☀</span></h1>
            <p className="intro">从这里开始今天的工作。你的项目进展都在掌握之中。</p>
            <div className="stats" aria-label="工作统计">
              <article><span>进行中的项目</span><strong>04</strong><small>与上周持平</small></article>
              <article><span>待完成任务</span><strong>12</strong><small>本周有 3 项到期</small></article>
              <article><span>团队更新</span><strong>08</strong><small>今天新增 2 条</small></article>
            </div>
            <section className="task-section" id="tasks">
              <div className="section-title"><div><span className="eyebrow">下一步</span><h2>近期任务</h2></div><a href="#tasks">查看全部 →</a></div>
              <div className="task-list">
                {tasks.map((task) => <article className="task-row" key={task.title}><span className="task-check" aria-hidden="true" /><div><strong>{task.title}</strong><small>{task.project}</small></div><span className="task-date">{task.date}</span><span className="task-status">{task.status}</span></article>)}
              </div>
            </section>
            <section className="note-card" id="activity"><div><span className="eyebrow">团队提示</span><h2>让想法更快落地</h2><p>把重复的整理工作交给助理，把时间留给真正重要的决定。</p></div><span className="note-symbol" aria-hidden="true">✦</span></section>
          </div>
        </main>
      </div>
      <AgentMount />
    </>
  );
}
