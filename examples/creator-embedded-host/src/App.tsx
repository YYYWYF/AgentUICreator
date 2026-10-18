import { useRef, useState } from "react";
import { AlignCenter, Bold, Grid2X2, MousePointer2, Presentation, Type } from "lucide-react";
import { useAgentUILocale } from "@za38.03/agent-ui-plugins";
import { AgentMount, AgentHostProvider } from "./AgentMount";
import { useAgentUI, useAgentUIState } from "./agent-ui";

export function App() { return <AgentHostProvider><EmbeddedWorkspace /></AgentHostProvider>; }

function EmbeddedWorkspace() {
  const { examples: copy } = useAgentUILocale();
  const agent = useAgentUI();
  const ready = useAgentUIState(s => s.status === "ready");
  const busy = useAgentUIState(s => s.runtime?.run.status === "running" || s.runtime?.run.status === "awaiting-input");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [sendFailed, setSendFailed] = useState(false);
  async function analyzePage() {
    setAssistantOpen(true);
    setSendFailed(false);
    try { await agent.sendMessage(copy.hostAnalyzePrompt); }
    catch { setSendFailed(true); }
  }
  const [title, setTitle] = useState<string | undefined>();
  const [bold, setBold] = useState(true);
  const [centered, setCentered] = useState(false);
  const [grid, setGrid] = useState(true);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const slideTitle = title ?? copy.nextGenerationWorkbench;
  return (
    <div className="embedded-host-page">
      <header className="app-bar">
        <div className="app-brand"><span className="app-brand-icon">A</span> atlas <span className="app-brand-divider">/</span>{copy.presentationDocument}</div>
        <div className="app-user">{copy.jiayiLin}<span>{copy.lin}</span></div>
      </header>
      <main className="embedded-host-content">
        <div className="document-heading">
          <div><div className="breadcrumbs">{copy.projects}<span>/</span>{copy.presentationDocument}</div><h1>{copy.nextGenerationWorkbench}</h1></div>
          <div className="host-assistant-actions">
            <span className="document-editing"><span aria-hidden="true" />{copy.editing}</span>
            <button type="button" disabled={!ready || busy} onClick={() => void analyzePage()}>{copy.hostAnalyzeButton}</button>
            <button type="button" aria-expanded={assistantOpen} onClick={() => setAssistantOpen(value => !value)}>{assistantOpen ? copy.hostCloseAssistant : copy.hostOpenAssistant}</button>
          </div>
        </div>
        {sendFailed && <p role="alert">{copy.hostSendFailed}</p>}
        <div className="split-workspace" data-assistant-open={assistantOpen}>
          <section className="presentation-editor" aria-label={copy.presentationEditor}>
            <div className="canvas-toolbar" role="toolbar" aria-label={copy.presentationEditor}>
              <button type="button" className="canvas-tool canvas-tool-selected" aria-label={copy.canvasSelect} title={copy.canvasSelect} onClick={() => titleInput.current?.blur()}><MousePointer2 aria-hidden="true" /></button>
              <button type="button" className="canvas-tool" aria-label={copy.canvasText} title={copy.canvasText} onClick={() => titleInput.current?.focus()}><Type aria-hidden="true" /></button>
              <span className="canvas-toolbar-divider" />
              <button type="button" className="canvas-tool" aria-label={copy.canvasBold} title={copy.canvasBold} aria-pressed={bold} onClick={() => setBold(value => !value)}><Bold aria-hidden="true" /></button>
              <button type="button" className="canvas-tool" aria-label={copy.canvasAlign} title={copy.canvasAlign} aria-pressed={centered} onClick={() => setCentered(value => !value)}><AlignCenter aria-hidden="true" /></button>
              <span className="canvas-toolbar-divider" />
              <button type="button" className="canvas-tool" aria-label={copy.canvasGrid} title={copy.canvasGrid} aria-pressed={grid} onClick={() => setGrid(value => !value)}><Grid2X2 aria-hidden="true" /></button>
              <span className="canvas-format">16:9</span>
            </div>
            <div className="canvas-workarea">
              <nav className="slide-strip" aria-label={copy.canvasSlide}>
                <span className="slide-number">01</span>
                <div className="slide-thumbnail" aria-current="page"><Presentation aria-hidden="true" /><span>{slideTitle}</span></div>
              </nav>
              <div className="canvas-stage" data-grid={grid}>
                <div className="presentation-slide" data-centered={centered}>
                  <div className="slide-accent" />
                  <div className="slide-kicker">{copy.projectSpace}</div>
                  <textarea ref={titleInput} className="slide-title" aria-label={copy.canvasText} rows={2} value={slideTitle} onChange={event => setTitle(event.target.value)} style={{ fontWeight: bold ? 750 : 400 }} />
                  <p className="slide-subtitle">{copy.canvasSubtitle}</p>
                  <div className="slide-pillars">{[copy.canvasPillarOne, copy.canvasPillarTwo, copy.canvasPillarThree].map((label, index) => <div key={label}><span>0{index + 1}</span><strong>{label}</strong></div>)}</div>
                  <div className="slide-footer"><span>atlas</span><span>01</span></div>
                </div>
                <span className="canvas-edit-hint">{copy.canvasHint}</span>
              </div>
            </div>
            <footer className="canvas-status"><span>{copy.canvasSlide} 1 / 1</span><span>16:9</span></footer>
          </section>
          <aside className="agent-pane" hidden={!assistantOpen} aria-label={copy.embeddedAssistant}><AgentMount /></aside>
        </div>
      </main>
    </div>
  );
}
