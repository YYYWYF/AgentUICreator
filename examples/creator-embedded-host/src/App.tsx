import { AgentMount } from "./AgentMount";

const milestones = [
  { name: "用户访谈", date: "9 月 12 日", progress: "已完成", done: true },
  { name: "交互原型", date: "9 月 19 日", progress: "进行中", done: false },
  { name: "开发交付", date: "10 月 03 日", progress: "待开始", done: false },
];

export function App() {
  return (
    <div className="split-workspace">
      <main className="document-pane">
        <header className="app-bar"><div className="app-brand"><span className="app-brand-icon">A</span> atlas <span className="app-brand-divider">/</span> 项目空间</div><div className="app-user">林嘉怡 <span>林</span></div></header>
        <div className="document-scroll">
          <div className="breadcrumbs">项目 <span>/</span> 产品设计 <span>/</span> 文档</div>
          <div className="document-heading"><div><span className="document-tag">项目文档</span><h1>下一代工作台</h1><p>为团队打造一个更清晰、更流畅的协作体验。</p></div><button type="button">分享文档</button></div>
          <div className="document-meta"><span className="meta-avatar">林</span><span>林嘉怡</span><span>·</span><span>更新于 9 月 24 日</span><span className="meta-status">● 正在编辑</span></div>
          <article className="document-card"><div className="section-number">01 / 项目概览</div><h2>我们要解决什么问题？</h2><p>团队的工作信息散落在不同工具中。成员需要反复切换页面，才能理解一个项目的背景、进度和下一步行动。我们希望把关键上下文放在同一个地方，让讨论和执行自然衔接。</p><div className="callout"><span>✦</span><p>设计原则：让重要信息在需要的时候出现，减少无意义的打断。</p></div></article>
          <article className="document-card"><div className="section-number">02 / 交付计划</div><h2>近期里程碑</h2><div className="milestones">{milestones.map((item) => <div className="milestone" key={item.name}><span className={item.done ? "milestone-dot done" : "milestone-dot"} /><strong>{item.name}</strong><span>{item.date}</span><small>{item.progress}</small></div>)}</div></article>
          <article className="document-card"><div className="section-number">03 / 备注</div><h2>待讨论的问题</h2><p>如何让助理在保留当前文档上下文的同时，协助用户探索不同方案？右侧的嵌入式助理可以与页面并排工作。</p></article>
        </div>
      </main>
      <aside className="agent-pane" aria-label="嵌入式助理"><AgentMount /></aside>
    </div>
  );
}
