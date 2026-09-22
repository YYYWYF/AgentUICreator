import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@agent-ui/react";
import {
  isMockAgentEndpoint,
  resolveMockScenarioSearchParams,
} from "../../agent-endpoint";
import { RuntimePanel } from "./RuntimePanel";
import { ScenarioPanel } from "./ScenarioPanel";
import styles from "./dev-studio.module.css";
import { useMockScenarioAutorun } from "./useMockScenarioAutorun";

type DevStudioTab = "scenario" | "runtime";

export interface DevStudioProps {
  endpoint: string | undefined;
}

const DEV_STUDIO_DOCK_SELECTOR = '[data-slot="agent-ui-dev-studio-dock"]';
const DEV_STUDIO_PANEL_SELECTOR = '[data-slot="agent-ui-dev-studio-panel"]';

function formatSpeed(value: string | undefined): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "1×";
  return parsed === 0 ? "Instant" : `${Math.min(10, Math.max(0, parsed))}×`;
}

function mockEntryLabel(): string {
  const { scenario, speed } = resolveMockScenarioSearchParams(
    window.location.search,
  );
  return `Dev · Mock · ${scenario ?? "default"} · ${formatSpeed(speed)}`;
}

export function DevStudio({ endpoint }: DevStudioProps) {
  const mockEnabled = isMockAgentEndpoint(endpoint);
  const [open, setOpen] = useState(false);
  const [dock, setDock] = useState<Element | null>(null);
  const [panelHost, setPanelHost] = useState<Element | null>(null);
  const [activeTab, setActiveTab] = useState<DevStudioTab>(() =>
    mockEnabled ? "scenario" : "runtime",
  );

  useMockScenarioAutorun(endpoint);

  useEffect(() => {
    if (!mockEnabled) setActiveTab("runtime");
  }, [mockEnabled]);

  useLayoutEffect(() => {
    const resolveDock = () => {
      setDock(document.querySelector(DEV_STUDIO_DOCK_SELECTOR));
      setPanelHost(document.querySelector(DEV_STUDIO_PANEL_SELECTOR));
    };
    resolveDock();

    const observer = new MutationObserver(resolveDock);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const entryLabel = mockEnabled ? mockEntryLabel() : "Dev · Runtime";
  const entry = (
    <Button
      data-agent-ui-preview-exclude=""
      aria-controls="agent-ui-dev-studio-panel"
      aria-expanded={open}
      aria-label={open
        ? "Close Agent UI Dev Studio"
        : "Open Agent UI Dev Studio"}
      className={dock === null ? styles.entry : styles.dockedEntry}
      onClick={() => setOpen((current) => !current)}
      size="sm"
      title={entryLabel}
      variant="outline"
    >
      <span className={styles.entryDot} aria-hidden="true" />
      {dock === null ? entryLabel : mockEnabled ? "Mock" : "Runtime"}
      <ChevronDownIcon
        aria-hidden="true"
        className={`${styles.entryChevron}${open ? ` ${styles.entryChevronOpen}` : ""}`}
      />
    </Button>
  );

  const panel = (
    <aside
      data-agent-ui-preview-exclude=""
      aria-label="Agent UI Dev Studio"
      className={panelHost === null ? styles.previewPanel : styles.panel}
      id="agent-ui-dev-studio-panel"
      role="region"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Development tools</p>
          <h2>{mockEnabled ? "Mock Agent" : "Agent UI Dev Studio"}</h2>
        </div>
      </header>

      {mockEnabled ? (
        <div aria-label="Dev Studio panels" className={styles.tabs} role="tablist">
          <button
            aria-controls="agent-ui-dev-studio-scenario"
            aria-selected={activeTab === "scenario"}
            className={styles.tab}
            id="agent-ui-dev-studio-scenario-tab"
            onClick={() => setActiveTab("scenario")}
            role="tab"
            tabIndex={activeTab === "scenario" ? 0 : -1}
            type="button"
          >
            Scenario
          </button>
          <button
            aria-controls="agent-ui-dev-studio-runtime"
            aria-selected={activeTab === "runtime"}
            className={styles.tab}
            id="agent-ui-dev-studio-runtime-tab"
            onClick={() => setActiveTab("runtime")}
            role="tab"
            tabIndex={activeTab === "runtime" ? 0 : -1}
            type="button"
          >
            Runtime
          </button>
        </div>
      ) : null}

      <div
        aria-labelledby={mockEnabled
          ? `agent-ui-dev-studio-${activeTab}-tab`
          : undefined}
        className={styles.tabPanel}
        id={mockEnabled
          ? `agent-ui-dev-studio-${activeTab}`
          : "agent-ui-dev-studio-runtime"}
        role={mockEnabled ? "tabpanel" : undefined}
      >
        {activeTab === "scenario" && mockEnabled ? (
          <ScenarioPanel endpoint={endpoint!} />
        ) : (
          <RuntimePanel endpoint={endpoint} mockEnabled={mockEnabled} />
        )}
      </div>
    </aside>
  );

  return (
    <>
      {dock === null ? entry : createPortal(entry, dock)}

      {open
        ? panelHost === null
          ? panel
          : createPortal(panel, panelHost)
        : null}
    </>
  );
}
